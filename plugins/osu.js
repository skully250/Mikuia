var osuapi = require('../osuapi')

var async
var bancho
var cli
var Mikuia
var osu
var _

var userData = {}

exports.commands = ['rank']

exports.handleCommand = function(tokens, from, channel) {
	switch(tokens[0]) {
		case 'rank':
			if(!_.isUndefined(tokens[1])) {
				tokens.splice(0, 1)
				var user = tokens.join(' ')
			} else {
				var user = Mikuia.channels[channel].plugins.osu.name
			}
			osu.getUser(user, function(err, user) {
				if(!err && !_.isEmpty(user)) {
					Mikuia.say(channel, 'Stats for ' + user.username + ': ' + user.pp_raw + 'pp, rank: #' + user.pp_rank)
				}
			})
	}
}

exports.handlePattern = function(patternName, from, channel, message) {
	if(patternName == 'osuBeatmap') {
		var results = /osu.ppy.sh\/(b|s)\/(\d+)/g.exec(message)
		var response = {}
		var status = ""
		Mikuia.log(Mikuia.LogStatus.Normal, 'Getting info for ' + cli.greenBright('/' + results[1] + '/' + results[2]))
		osu.getBeatmap(results[2], results[1], function(err, map) {
			if(!err) {
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
				var escapedArtist = map.artist.split('(').join('{').split(')').join('}')
				var escapedTitle = map.title.split('(').join('{').split(')').join('}')
				var escapedVersion = map.version.split('(').join('{').split(')').join('}')
				bancho.say(Mikuia.channels[channel].plugins.osu.name, 'New request from ' + from + ': (' + escapedArtist + ' - ' + escapedTitle + ' [' + escapedVersion + '])[http://' + results[0] + ']')
			}
		})
	}
}

exports.hooks = ['1m']

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
	osu.getUser(Mikuia.channels[channel].plugins.osu.name, function(err, user) {
		userData[user.username] = {}
		if(!err) {
			userData[user.username].pp = user.pp_raw
			userData[user.username].rank = user.pp_rank
		}
	})
}

exports.name = 'osu'

exports.patterns = {
	osuBeatmap: /osu.ppy.sh\/(b|s)\/(\d+)/g
}

exports.runHook = function(hookName) {
	switch(hookName) {
		case '1m':
			async.each(Mikuia.enabled.osu, function(channel, callback) {
				osu.getUser(Mikuia.channels[channel].plugins.osu.name, function(err, user) {
					if(!err && userData[user.username].pp != 0) {
						if(userData[user.username].pp != user.pp_raw) {
							var diff = Math.round((user.pp_raw - userData[user.username].pp) * 100) / 100
							var rnk = user.pp_rank - userData[user.username].rank

							if(diff > 0) {
								Mikuia.say(channel, '+' + diff + 'pp!')
								Mikuia.log(Mikuia.LogStatus.Normal, 
cli.greenBright(Mikuia.channels[channel].plugins.osu.name) + ' gained ' + cli.yellowBright('+' + diff + 'pp') + '.')
							} else {
								Mikuia.say(channel, diff + 'pp!')
							}

							if(rnk > 0) {
								Mikuia.say(channel, 'Rank: #' + user.pp_rank + ' (' + rnk +' up!)')
							} else {
								Mikuia.say(channel, 'Rank: #' + user.pp_rank + ' (' + Math.abs(rnk) +' down)')
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
			}, function(err) {
				if(err) {
					throw err
				}
				//console.log(userData)
			})
			break
	}
}

exports.settings = {
	apiKey: 'YOUR_API_KEY_HERE',
	name: 'YOUR_USERNAME_HERE',
	password: 'IRC_PASSWORD_HERE_YOU_GET_AN_IDEA'
}
