var osuapi = require('../osuapi')

var async
var bancho
var cli
var Mikuia
var osu
var _

var lastRequest = {}
var userData = {}

exports.manifest = {
	name: 'osu',
	fullName: 'osu!',
	type: 'channel',
	description: 'Plugin for osu!',
	commands: {
		'osu.rank': {
			description: 'Shows the rank of a player.',
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
		}
	},
	hooks: ['1m', 'chat', 'enable'],
	settings: {
		channel: {
			info: {
				description: 'Show beatmap info for links on chat.',
				type: 'radio'
			},
			events: {
				description: 'Show events and rank changes on chat.',
				type: 'radio'
			},
			name: {
				name: 'Username',
				default: '',
				description: 'Your osu! username.',
				type: 'text'
			},
			requests: {
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

function checkForMap(from, channel, message, callback) {
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

function sendRequest(channel, from, map, link) {
	var areWeSending = true
	if(Mikuia.channels[channel].plugins.osu.settings.requestLimit) {
		if(lastRequest[from] && (new Date).getTime() < lastRequest[from] + Mikuia.channels[channel].plugins.osu.settings.requestLimit * 60000) {
			areWeSending = false
		} else {
			lastRequest[from] = (new Date).getTime()
		}
	}
	if(areWeSending) {
		var escapedArtist = map.artist.split('(').join('{').split(')').join('}')
		var escapedTitle = map.title.split('(').join('{').split(')').join('}')
		var escapedVersion = map.version.split('(').join('{').split(')').join('}')
		bancho.say(Mikuia.channels[channel].plugins.osu.settings.name, 'New request from ' + from + ': (' + escapedArtist + ' - ' + escapedTitle + ' [' + escapedVersion + '])[http://' + link + ']')
	}
}

function showInfo(channel, map) {
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
	}
	Mikuia.say(channel, '[' + status + '] ' + map.artist + ' - ' + map.title + ' - [' + map.version + '] (by ' + map.creator + '), ' + Math.round(map.bpm) + ' BPM, ' + (Math.round(map.difficultyrating * 100) / 100) + ' stars')
}

exports.handleCommand = function(command, tokens, from, channel) {
	switch(command) {
		case 'osu.rank':
			if(!_.isUndefined(tokens[1])) {
				tokens.splice(0, 1)
				var user = tokens.join(' ')
			} else {
				if(Mikuia.channels[channel].plugins.osu.settings) {
					var user = Mikuia.channels[channel].plugins.osu.settings.name
				}
			}
			if(user != undefined) {
				osu.getUser(user, function(err, user) {
					if(!err && !_.isEmpty(user)) {
						Mikuia.say(channel, 'Stats for ' + user.username + ': ' + user.pp_raw + 'pp, rank: #' + user.pp_rank)
					}
				})
			}
			break;
		case 'osu.request':
			if(!_.isUndefined(tokens[1])) {
				checkForMap(from, channel, tokens[1], function(err, map, link) {
					if(!err) {
						sendRequest(channel, from, map, link)
						if(Mikuia.channels[channel].plugins.osu.settings.info) {
							showInfo(channel, map)
						}
					}
				})
			}
			break;
	}
}

exports.handleMessage = function(from, channel, message) {
	if(Mikuia.channels[channel].plugins.osu.settings) {
		if(Mikuia.channels[channel].plugins.osu.settings.info || Mikuia.channels[channel].plugins.osu.settings.requests) {
			checkForMap(from, channel, message, function(err, map, link) {
				if(!err) {
					if(Mikuia.channels[channel].plugins.osu.settings.requests) {
						sendRequest(channel, from, map, link)
					}
					if(Mikuia.channels[channel].plugins.osu.settings.info) {
						showInfo(channel, map)
					}
				}
			})
		}
	}
}

exports.init = function(m) {
	Mikuia = m
	osu = new osuapi(Mikuia.settings.plugins.osu.apiKey)

	async = Mikuia.modules.async
	cli = Mikuia.modules.cli
	irc = Mikuia.modules.irc
	_ = Mikuia.modules._

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

exports.load = function(channel) {
	if(Mikuia.channels[channel].plugins.osu.settings && Mikuia.channels[channel].plugins.osu.settings.name) {
		osu.getUser(Mikuia.channels[channel].plugins.osu.settings.name, function(err, user) {			
			if(!err && !_.isEmpty(user)) {
				userData[user.username] = {}
				userData[user.username].pp = user.pp_raw
				userData[user.username].rank = user.pp_rank
			}
		})
	}
}

exports.runHook = function(hookName) {
	switch(hookName) {
		case '1m':
			async.each(Mikuia.enabled.osu, function(channel, callback) {
				if(Mikuia.channels[channel].plugins.osu.settings) {
					if(Mikuia.channels[channel].plugins.osu.settings.events) {
						osu.getUser(Mikuia.channels[channel].plugins.osu.settings.name, function(err, user) {
							if(!err && !_.isEmpty(user) && userData[user.username].pp != 0) {
								if(userData[user.username].pp != user.pp_raw) {
									var diff = Math.round((user.pp_raw - userData[user.username].pp) * 100) / 100
									var rnk = user.pp_rank - userData[user.username].rank

									if(diff > 0) {
										Mikuia.say(channel, '+' + diff + 'pp!')
										Mikuia.log(Mikuia.LogStatus.Normal, cli.greenBright(Mikuia.channels[channel].plugins.osu.settings.name) + ' gained ' + cli.yellowBright('+' + diff + 'pp') + '.')
									} else {
										Mikuia.say(channel, diff + 'pp!')
									}

									if(rnk > 0) {
										Mikuia.say(channel, 'Rank: #' + user.pp_rank + ' (' + rnk +' down)')
									} else {
										Mikuia.say(channel, 'Rank: #' + user.pp_rank + ' (' + Math.abs(rnk) +' up!)')
									}
								}

								if(!_.isEmpty(user.events)) {
									var newestEvent = new Date(user.events[0].date).getTime() / 1000
									if(newestEvent > userData[user.username].lastEvent) {
										Mikuia.say(channel, _.stripTags(user.events[0].display_html))
									}
									userData[user.username].lastEvent = newestEvent
								}

								userData[user.username].pp = user.pp_raw
								userData[user.username].rank = user.pp_rank
							}
							callback(err)
						})
					} else {
						callback()
					}
				} else {
					callback()
				}
			}, function(err) {
				if(err) {
					throw err
				}
				//console.log(userData)
			})
			break
	}
}