var osuapi = require('../osuapi')

var async
var bancho
var cli
var limiter
var Mikuia
var osu
var _

var banchoRateLimiter
var lastRequest = {}
var userData = {}

exports.manifest = {
	name: 'osu',
	fullName: 'osu!',
	type: 'channel',
	description: 'Plugin for osu!',
	commands: {
		'osu.rank': {
			description: 'Shows the rank of a player. (osu!)',
			arguments: {
				'username': {
					description: 'Username to check.',
					optional: true
				}
			}
		},
		'osu.rank.ctb': {
			description: 'Shows the rank of a player. (Catch the Beat)',
			arguments: {
				'username': {
					description: 'Username to check.',
					optional: true
				}
			}
		},
		'osu.rank.osumania': {
			description: 'Shows the rank of a player. (osu!mania)',
			arguments: {
				'username': {
					description: 'Username to check.',
					optional: true
				}
			}
		},
		'osu.rank.taiko': {
			description: 'Shows the rank of a player. (Taiko)',
			arguments: {
				'username': {
					description: 'Username to check.',
					optional: true
				}
			}
		},
		'osu.request': {
			description: 'Sends a map request through Bancho.',
			arguments: {
				'link': {
					description: 'Beatmap difficulty/set link',
					optional: false
				}
			}
		},
		'osu.tp.rank': {
			description: 'Shows a osu!tp rank of a player.',
			arguments: {
				'username': {
					description: 'Username to check.',
					optional: true
				}
			}
		}
	},
	hooks: ['10s', '1h', 'chat', 'enable'],
	settings: {
		channel: {
			info: {
				default: false,
				description: 'Show beatmap info for links on chat.',
				type: 'radio'
			},
			events: {
				default: false,
				description: 'Show events and rank changes on chat.',
				type: 'radio'
			},
			minimumRank: {
				name: 'Minimum event rank',
				default: 1000,
				description: 'Minimum rank for song event to show (1-1000)',
				type: 'text'
			},
			name: {
				name: 'Username',
				default: '',
				description: 'Your osu! username.',
				type: 'text'
			},
			requests: {
				default: false,
				description: 'Pass all map links through osu! chat (requests without a command).',
				type: 'radio'
			},
			requestLimit: {
				name: 'Request limit (in minutes)',
				default: 0,
				description: 'How often can a person request',
				type: 'text'
			}
		},
		server: {
			apiKey: 'YOUR_API_KEY_HERE',
			name: 'YOUR_USERNAME_HERE',
			password: 'IRC_PASSWORD_HERE_YOU_GET_AN_IDEA'
		}
	}
}

function checkForMap(from, Channel, message, callback) {
	if(/osu.ppy.sh\/(b|s)\/(\d+)/g.test(message)) {
		var results = /osu.ppy.sh\/(b|s)\/(\d+)/g.exec(message)
		var response = {}
		var status = ""
		Mikuia.log(Mikuia.LogStatus.Normal, 'Getting info for ' + cli.greenBright('/' + results[1] + '/' + results[2]))
		osu.getBeatmap(results[2], results[1], function(err, map) {
			callback(err, map, results[0])
		})
	}
}

function sendRequest(Channel, from, map, link) {
	var areWeSending = true
	if(lastRequest[from] && (new Date).getTime() < lastRequest[from] + Channel.getSetting('osu', 'requestLimit') * 60000) {
		areWeSending = false
	} else {
		lastRequest[from] = (new Date).getTime()
	}
	if(areWeSending && !_.isUndefined(map) && Channel.getSetting('osu', 'name') != '') {
		var escapedArtist = map.artist.split('(').join('{').split(')').join('}')
		var escapedTitle = map.title.split('(').join('{').split(')').join('}')
		var escapedVersion = map.version.split('(').join('{').split(')').join('}')
		banchoRateLimiter.removeTokens(1, function(err, remainingRequests) {
			console.log('banchosay - ' + Channel.getSetting('osu', 'name'))
			bancho.say(Channel.getSetting('osu', 'name'), 'New request from ' + from + ': (' + escapedArtist + ' - ' + escapedTitle + ' [' + escapedVersion + '])[http://' + link + ']')
			Mikuia.log(Mikuia.LogStatus.Warning, 'osu - Remaining tokens: ' + remainingRequests)
		})
	}
}

function showInfo(Channel, map) {
	var status
	switch(map.approved) {
		case "-2":
			status = "Graveyard"
			break
		case "-1":
			status = "WIP"
			break
		case "0":
			status = "Pending"
			break
		case "1":
			status = "Ranked"
			break
		case "2":
			status = "Approved"
			break
		case "3":
			status = "Qualified"
			break
	}
	Mikuia.say(Channel.getIRCName(), '[' + status + '] ' + map.artist + ' - ' + map.title + ' - [' + map.version + '] (by ' + map.creator + '), ' + Math.round(map.bpm) + ' BPM, ' + (Math.round(map.difficultyrating * 100) / 100) + ' stars')
}

exports.handleCommand = function(command, tokens, from, Channel) {
	switch(command) {
		case 'osu.rank':
		case 'osu.rank.ctb':
		case 'osu.rank.osumania':
		case 'osu.rank.taiko':
			var modes = {
				'osu.rank': 0,
				'osu.rank.ctb': 2,
				'osu.rank.osumania': 3,
				'osu.rank.taiko': 1
			}
			if(!_.isUndefined(tokens[1])) {
				tokens.splice(0, 1)
				var user = tokens.join(' ')
			} else {
				var user = Channel.getSetting('osu', 'name')
			}
			if(user != undefined && user != '') {
				osu.getUser(user, modes[command], function(err, user) {
					if(!err && !_.isEmpty(user)) {
						Mikuia.say(Channel.getIRCName(), 'Stats for ' + user.username + ': ' + user.pp_raw + 'pp, rank: #' + user.pp_rank)
					}
				})
			}
			break
		case 'osu.request':
			if(!_.isUndefined(tokens[1])) {
				checkForMap(from, Channel, tokens[1], function(err, map, link) {
					if(!err) {
						sendRequest(Channel, from, map, link)
						if(Channel.getSetting('osu', 'info')) {
							showInfo(Channel, map)
						}
					}
				})
			}
			break
		case 'osu.tp.rank':
			if(!_.isUndefined(tokens[1])) {
				tokens.splice(0, 1)
				var user = tokens.join(' ')
			} else {
				var user = Channel.getSetting('osu', 'name')
			}
			if(user != undefined && user != '') {

				var continueTp = function(userId, username) {
					osu.getTpUser(userId, function(err, user) {
						if(!err && !_.isEmpty(user)) {
							Mikuia.say(Channel.getIRCName(), 'osu!tp stats for ' + username + ': ' + user.rating + 'tp, rank: #' + user.rank + '\nAim: ' + user.aimrating + ' Spd: ' + user.speedrating + ' Acc: ' + user.accrating)
						}
					})
				}

				if(!_.isUndefined(userData[user])) {
					continueTp(userData[user].user_id, user)
				} else {
					osu.getUser(user, 0, function(err, userJson) {
						if(!err && !_.isEmpty(userJson)) {
							continueTp(userJson.user_id, user)
						}
					})
				}
			}
			break
	}
}

exports.handleMessage = function(from, Channel, message) {
	if(Channel.getSetting('osu', 'info') || Channel.getSetting('osu', 'requests')) {
		checkForMap(from, Channel, message, function(err, map, link) {
			if(!err) {
				if(Channel.getSetting('osu', 'requests')) {
					sendRequest(Channel, from, map, link)
				}
				if(Channel.getSetting('osu', 'info')) {
					showInfo(Channel, map)
				}
			}
		})
	}
}

exports.init = function(m) {
	Mikuia = m
	osu = new osuapi(Mikuia.settings.plugins.osu.apiKey)

	async = Mikuia.modules.async
	cli = Mikuia.modules.cli
	irc = Mikuia.modules.irc
	limiter = Mikuia.modules.limiter
	_ = Mikuia.modules._

	banchoRateLimiter = new limiter(1, 'second')

	bancho = new irc.Client('cho.ppy.sh', Mikuia.settings.plugins.osu.name, {
		sasl: true,
		nick: Mikuia.settings.plugins.osu.name,
		userName: Mikuia.settings.plugins.osu.name,
		password: Mikuia.settings.plugins.osu.password
	})

	exports._api = osu
	exports._bancho = bancho

	bancho.on('registered', function(message) {
		Mikuia.log(Mikuia.LogStatus.Success, 'Connected to osu!Bancho.')
	})

	bancho.on('motd', function(motd) {
		Mikuia.log(Mikuia.LogStatus.Normal, 'Received osu!Bancho MOTD.')
	})
}

exports.load = function(Channel) {
	if(Channel.getSetting('osu', 'name') != '') {
		osu.getUser(Channel.getSetting('osu', 'name'), 0, function(err, user) {			
			if(!err && !_.isEmpty(user)) {
				userData[user.username] = {}
				userData[user.username].user_id = user.user_id
				userData[user.username].pp = user.pp_raw
				userData[user.username].rank = user.pp_rank
			}
		})
	}
}

exports.runHook = function(hookName) {
	switch(hookName) {
		case '10s':
		case '1h':
			async.each(Mikuia.enabled.osu, function(channel, callback) {

				// Holy shit, this is going to be a complete hate-fest.
				var canWeDoIt
				if(hookName == '10s') {
					if(channel in Mikuia.streams) {
						canWeDoIt = true
					} else {
						canWeDoIt = false
					}
				} else if(hookName == '1h') {
					canWeDoIt = true
				}

				// BRACE FOR THE IMPACT
				if(canWeDoIt) {

					var Channel = Mikuia.getChannel(channel)

					if(Channel.getSetting('osu', 'name') != '') {
						if(Channel.getSetting('osu', 'events')) {
							osu.getUser(Channel.getSetting('osu', 'name'), 0, function(err, user) {
								if(!err && !_.isEmpty(user) && !_.isUndefined(userData[user.username]) && userData[user.username].pp != 0) {
									if(userData[user.username].pp != user.pp_raw) {
										var diff = Math.round((user.pp_raw - userData[user.username].pp) * 100) / 100
										var rnk = user.pp_rank - userData[user.username].rank

										if(diff > 0) {
											Mikuia.say(Channel.getIRCName(), '+' + diff + 'pp!')
											Mikuia.log(Mikuia.LogStatus.Normal, cli.greenBright(Channel.getSetting('osu', 'name')) + ' gained ' + cli.yellowBright('+' + diff + 'pp') + '.')
										} else {
											Mikuia.say(Channel.getIRCName(), diff + 'pp!')
										}

										if(rnk > 0) {
											Mikuia.say(Channel.getIRCName(), 'Rank: #' + user.pp_rank + ' (' + rnk +' down)')
										} else if(rnk < 0) {
											Mikuia.say(Channel.getIRCName(), 'Rank: #' + user.pp_rank + ' (' + Math.abs(rnk) +' up!)')
										}
									}

									if(!_.isEmpty(user.events)) {
										var newestEvent = new Date(user.events[0].date).getTime() / 1000
										if(newestEvent > userData[user.username].lastEvent) {
											var string = _.stripTags(user.events[0].display_html).trim()
											var tokens = /.*?(\d+)/.exec(string)

											minRank = Channel.getSetting('osu', 'minimumRank')

											if(tokens) {
												if(tokens[1] <= minRank) {
													Mikuia.say(Channel.getIRCName(), string)
												}
											} else {
												Mikuia.say(Channel.getIRCName(), string)
											}

										}
										userData[user.username].lastEvent = newestEvent
									}

									userData[user.username].pp = user.pp_raw
									userData[user.username].rank = user.pp_rank
								} else {
									Mikuia.log(Mikuia.LogStatus.Warning, 'osu! - Failed to update profile of ' + channel + ' (' + Channel.getSetting('osu', 'name') + ').')
								}
								callback(err)
							})
						} else {
							callback()
						}
					} else {
						callback()
					}
				} else {
					callback()
				}
			}, function(err) {
				if(err) {
					Mikuia.log(Mikuia.LogStatus.Error, 'osu! - One of the profile updates failed.')
				}
				//console.log(userData)
			})
			break
	}
}