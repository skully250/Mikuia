var async = require('async')
var cli = require('cli-color')
var fs = require('fs')
var irc = require('irc')
var limiter = require('limiter').RateLimiter
var moment = require('moment')
var newrelic = require('newrelic')
var osuapi = require('./osuapi')
var Redis = require('redis')
var repl = require('repl')
var request = require('request')
var Twitchy = require('twitchy')
var _ = require('underscore')
_.str = require('underscore.string')
_.mixin(_.str.exports())
_.str.include('Underscore.string', 'string')

var client
var redis
var twitch
var www = require('./www')

var twitchRateLimit = new limiter(10, 30000)

process.on('uncaughtException', function(err) {
	console.error(err)
})

var Mikuia = new function() {
	
	this.LogStatus = {
		Success: 'SUCCESS',
		Normal: 'INFO',
		Warning: 'WARN',
		Error: 'ERROR',
		Fatal: 'FATAL'
	}

	this.activities = {}
	this.activitySort = []
	this.channels = {}
	this.channels2 = {}
	this.commands = {}
	this.enabled = {}
	this.hooks = {
		'10s': [],
		'15s': [],
		'1m': [],
		'5m': [],
		'1h': [],
		'chat': [],
		'enable': []
	}
	this.leaderboards = {}
	this.modules = {
		async: async,
		cli: cli,
		fs: fs,
		irc: irc,
		limiter: limiter,
		moment: moment,
		newrelic: newrelic,
		redis: redis,
		request: request,
		twitch: twitch,
		_: _
	}
	this.plugins = {}
	this.settings = {
		plugins: {}
	}
	this.streams = {}
	this.www = www
	this.viewers = {}

	this.addActivity = function(data) {
		var activity = new Activity()
		activity.setData(data)
		activity.update()
		Mikuia.activities[activity.getId()] = activity
		this.activitySort.unshift(activity.getId())
	}

	this.addLeaderboard = function(lbName) {
		this.leaderboards[lbName] = new Leaderboard(lbName)
	}

	this.addViewer = function(viewerName, channelName) {
		if(_.isUndefined(this.viewers[viewerName])) {
			this.viewers[viewerName] = []
		}
		if(this.viewers[viewerName].indexOf(channelName) == -1) {
			this.viewers[viewerName].push(channelName)
		}
	}

	this.getActivities = function() {
		return this.activitySort
	}

	this.getActivity = function(id, cb) {
		var self = this
		if(id in this.activities) {
			return this.activities[id]
		} else {
			if(cb != undefined) {
				var act = new Activity(id, function(err, activity) {
					if(!err) {
						self.activities[id] = activity
					}
					cb(err, activity)
				})
			} else {
				this.activities[id] = new Activity(id)
				return this.activities[id]
			}
		}
	}

	this.getChannel = function(channelName) {
		if(!_.isUndefined(channelName)) {
			channelName = channelName.toLowerCase()
			if(channelName.indexOf('#') == 0) {
				channelName = channelName.replace('#', '')
			}
		}

		if(channelName in this.channels2) {
			return this.channels2[channelName]
		} else {
			this.channels2[channelName] = new Channel(channelName)
			return this.channels2[channelName]
		}
	}

	this.getChannelIfExists = function(channelName) {
		if(!_.isUndefined(channelName)) {
			channelName = channelName.toLowerCase()
			if(channelName.indexOf('#') == 0) {
				channelName = channelName.replace('#', '')
			}
		}

		if(channelName in this.channels2) {
			return this.channels2[channelName]
		} else {
			return false
		}
	}

	this.getLeaderboard = function(lbName) {
		if(lbName in this.leaderboards) {
			return this.leaderboards[lbName]
		} else {
			return false
		}
	}

	this.handleError = function(message) {
		// wat
	}

	this.handleMessage = function(from, channel, message) {
		var self = this
		if(message.indexOf('!') == 0) {
			var tokens = message.replace('!', '').split(' ')
			var trigger = tokens[0].toLowerCase()

			if(trigger == 'mikuia') {
				var commandObject = { command: 'mikuia.about' }
				var command = commandObject.command
				var pl = 'base'
			} else {
				var commandObject = this.getChannel(channel).getCommand(trigger)
				if(commandObject != false) {
					var command = commandObject.command
					var pl = this.getChannel(channel).getPlugin(this.commands[command].plugin)
				}
			}

			if(commandObject != false) {
				var command = commandObject.command
				if(!_.isUndefined(pl)) {
					this.plugins[this.commands[command].plugin].handleCommand(command, tokens, from, Mikuia.getChannel(channel))
				}
			}
		} else {
			_.each(self.hooks.chat, function(pluginName) {
				if(self.getChannel(channel).hasPlugin(pluginName)) {
					self.plugins[pluginName].handleMessage(from, Mikuia.getChannel(channel), message)
				}
			})
		}
	}

	this.log = function(status, message) {
		switch(status) {
			case this.LogStatus.Success:
				color = cli.greenBright
				break
			case this.LogStatus.Normal:
				color = cli.whiteBright
				break
			case this.LogStatus.Warning:
				color = cli.yellowBright
				break
			case this.LogStatus.Error:
				color = cli.redBright
				break
			case this.LogStatus.Fatal:
				color = cli.red
				break
			default:
				color = cli.white
				break
		}
		console.log(moment().format('HH:mm:ss') + ' [' + color(status) + '] ' + message)
		if(status == this.LogStatus.Error || status == this.LogStatus.Fatal) {
			this.handleError(message)
		}
	}

	this.removeViewer = function(viewerName, channelName) {
		if(!_.isUndefined(this.viewers[viewerName])) {
			if(this.viewers[viewerName].indexOf(channelName) > -1) {
				var index = this.viewers[viewerName].indexOf(channelName)
				this.viewers[viewerName].splice(index, 1)
			}
		}
	}

	this.say = function(target, message) {
		twitchRateLimit.removeTokens(1, function(err, remainingRequests) {
			client.say(target, message)
			Mikuia.log(Mikuia.LogStatus.Normal, '(' + cli.greenBright(target) + ') ' + cli.magentaBright('mikuia') + ' (' + cli.magenta(Math.round(remainingRequests)) + '): ' + cli.whiteBright(message))
		})
	}

	this.sortObject = function(object) {
		var keys = new Array()
		var obj = {}

		for(var i in object) {
			keys.push(i)
		}

		keys.sort()

		for(var i in keys) {
			obj[keys[i]] = object[keys[i]]
		}

		return obj
	}

	this.runHooks = function(hookName) {
		var self = this
		async.each(this.hooks[hookName], function runHook(pluginName, callback) {
			self.plugins[pluginName].runHook(hookName)
			callback()
		}, function hookRunEnd(err) {
			if(err) {
				self.log(self.LogStatus.Error, 'Failed to run hook ' + hookName + '.')
			}
		})
	}

	this.getViewers = getViewers

	this.joinChannel = function(channelName) {
		var self = this
		client.join('#' + channelName, function(nick, message) {
			self.log(self.LogStatus.Success, 'Joined #' + cli.greenBright(channelName) + ' on Twitch IRC.')
		})
	}

	this.leaveChannel = function(channelName, reason) {
		var self = this
		client.part('#' + channelName, function(nick, reason, message) {
			self.log(self.LogStatus.Success, 'Left #' + cli.redBright(channelName) + ' on Twitch IRC.')
		})
	}

	this.refreshViewers = refreshViewers
}

var activity = require('./models/Activity')
var channel = require('./models/Channel')
var leaderboard = require('./models/Leaderboard')
activity.init(Mikuia)
channel.init(Mikuia)
leaderboard.init(Mikuia)
var Activity = activity.class
var Channel = channel.class
var Leaderboard = leaderboard.class

Mikuia.log(Mikuia.LogStatus.Normal, 'Starting up Mikuia...')

fs.readFile('settings.json', {encoding: 'utf8'}, function(err, data) {
	if(err) {
		Mikuia.log(Mikuia.LogStatus.Warning, 'Settings file doesn\'t exist, will create a default one.')
	} else {
		try {
			Mikuia.settings = JSON.parse(data)
		} catch(e) {
			Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse setting JSON file')
		}
		Mikuia.modules.redis = Redis.createClient(6379, '127.0.0.1', {
			auth_pass: Mikuia.settings.plugins.base.redisPassword
		})
		redis = Mikuia.modules.redis
		www.init(Mikuia)
	}
	fs.readdir('plugins', function(err, files) {
		if(err) {
			Mikuia.log(Mikuia.LogStatus.Fatal, 'Can\'t access "plugins" directory.')
		} else {
			Mikuia.log(Mikuia.LogStatus.Normal, 'Found ' + cli.greenBright(files.length) + ' entries.')
		}
		async.each(files, function loadPlugin(fileName, callback) {
			if(fileName.indexOf('.js') > 0) {
				Mikuia.log(Mikuia.LogStatus.Normal, 'Loading plugin: ' + cli.yellowBright(fileName) + '.')
				var plugin = require('./plugins/' + fileName.replace('.js', ''))
				if(_.isUndefined(Mikuia.settings.plugins[plugin.manifest.name])) {
					Mikuia.settings.plugins[plugin.manifest.name] = {}
				}
				if(plugin.manifest.settings != undefined) {
					_.each(plugin.manifest.settings.server, function loadDefaultSetting(defaultValue, key) {
						if(_.isUndefined(Mikuia.settings.plugins[plugin.manifest.name][key])) {
							Mikuia.settings.plugins[plugin.manifest.name][key] = defaultValue
						}
					})
				}
				_.each(plugin.manifest.commands, function loadCommand(data, command) {
					Mikuia.commands[command] = data
					Mikuia.commands[command].plugin = plugin.manifest.name
				})
				_.each(plugin.manifest.hooks, function loadHook(hookName) {
					Mikuia.hooks[hookName].push(plugin.manifest.name)
				})
				Mikuia.enabled[plugin.manifest.name] = []
				plugin.init(Mikuia)
				Mikuia.plugins[plugin.manifest.name] = plugin
			}
			callback()
		}, function loadPluginEnd(err) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'One of the plugins failed to load.')
			}
			initTwitch()
			fs.writeFileSync('settings.json', JSON.stringify(Mikuia.settings, null, '\t'))
			Mikuia.runHooks('10s')
			//Mikuia.runHooks('1h')
		})
	})
})

setInterval(function() {
	Mikuia.runHooks('10s')
}, 10000)

setInterval(function() {
	Mikuia.runHooks('15s')
}, 15000)

setInterval(function() {
	Mikuia.runHooks('1m')
}, 60000)

setInterval(function() {
	refreshViewers(function(err) {
		Mikuia.runHooks('5m')
	})
}, 300000)

setInterval(function() {
	Mikuia.runHooks('1h')
}, 3600000)

function initTwitch() {
	client = new irc.Client('irc.twitch.tv', Mikuia.settings.plugins.base.name, {
		sasl: true,
		nick: Mikuia.settings.plugins.base.name,
		userName: Mikuia.settings.plugins.base.name,
		password: Mikuia.settings.plugins.base.password
	})

	Mikuia.modules.twitch = new Twitchy({
		key: Mikuia.settings.plugins.base.clientID,
		secret: Mikuia.settings.plugins.base.clientSecret
	})

	twitch = Mikuia.modules.twitch

	twitch.auth(function(err, token) {
		if(!err) {
			Mikuia.log(Mikuia.LogStatus.Success, 'Authed to Twitch with token: ' + token)
		} else {
			Mikuia.log(Mikuia.LogStatus.Error, 'Failed to auth to Twitch.')
		}
	})

	Mikuia.log(Mikuia.LogStatus.Normal, 'Connecting to Twitch IRC...')

	client.on('motd', function(motd) {
		Mikuia.log(Mikuia.LogStatus.Normal, 'Received Twitch IRC MOTD.')
	})

	client.on('registered', function(message) {
		Mikuia.log(Mikuia.LogStatus.Success, 'Connected to Twitch IRC.')
		redis.smembers('channels', function(redisErr, channels) {
			if(!redisErr) {
				async.each(channels, function loadChannel(channelName, callback) {
					Mikuia.joinChannel(channelName)
					callback()
				}, function loadChannelsEnd(err) {
					if(err) {
						Mikuia.log(Mikuia.LogStatus.Error, 'One of the channels failed to load.')
					}
				})
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get channel list from Redis.')
			}
		})
	})

	client.on('message#', function(nick, to, text, message) {
		Mikuia.handleMessage(nick, to, text)
		Mikuia.log(Mikuia.LogStatus.Normal, '(' + cli.greenBright(to) + ') ' + cli.yellowBright(nick) + ': ' + cli.whiteBright(text))
	})

	client.on('names', function(channel, nicks) {
		Mikuia.getChannel(channel).setIRCUsers(nicks)
		_.each(nicks, function(element, key, value) {
			Mikuia.addViewer(key, channel)
		})
	})

	client.on('join', function(channel, nick, message) {
		Mikuia.getChannel(channel).addIRCUser(nick, '')
		Mikuia.addViewer(nick, channel)
	})

	client.on('part', function(channel, nick, reason, message) {
		Mikuia.getChannel(channel).removeIRCUser(nick)
		Mikuia.removeViewer(nick, channel)
	})

	client.on('+mode', function(channel, by, mode, argument, message) {
		if(mode == 'o') {
			Mikuia.getChannel(channel).addIRCUser(message.args[2], '+')
		}
	})

	client.on('-mode', function(channel, by, mode, argument, message) {
		if(mode == 'o') {
			Mikuia.getChannel(channel).addIRCUser(message.args[2], '')
		}
	})

	Mikuia.modules.redis.smembers('activities', function(err, reply) {
		if(!err) {
			async.each(reply, function(activityId, asyncCallback) {
				Mikuia.getActivity(activityId)
				setTimeout(function() {
					asyncCallback(false)
				}, 1000)
			}, function(err) {
				if(err) {
					console.log('OH COME ON')
				}
				Mikuia.activitySort = _.sortBy(Object.keys(Mikuia.activities), function(activityId) { return Mikuia.getActivity(activityId).getDate() * -1 })
			})
		}
	})

	Mikuia.addLeaderboard('bestLive')
	Mikuia.addLeaderboard('viewers')

	refreshViewers(function(err) {
		// derp
	})
}

function getViewers(callback) {
	redis.zrange('viewers', 0, -1, "WITHSCORES", function(err, data) {
		if(err) {
			Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get viewer list from Redis.')
		}
		callback(err, data)
	})
}

function refreshViewers(callback) {
	redis.smembers('channels', function(err, channels) {
		if(!err) {
			var apiList = channels.join(',')
			twitch._get('streams/?channel=' + apiList, function(error, result) {
				if(!error && result.req.res.body.streams != undefined) {
					Mikuia.streams = {}
					Mikuia.getLeaderboard('bestLive').removeAll()
					Mikuia.getLeaderboard('viewers').removeAll()

					_.each(result.req.res.body.streams, function(stream) {
						console.log('IAMDOINGEACH')
						var channelName = stream.channel.name
						Mikuia.streams['#' + channelName] = stream
						Mikuia.getChannel(channelName).setDisplayName(stream.channel.display_name)

						Mikuia.getLeaderboard('bestLive').updateScore(channelName, Mikuia.getChannel(channelName).getInfo('sp'))
						Mikuia.getLeaderboard('viewers').updateScore(channelName, stream.viewers)
						console.log('IENDEDEACH')
					})
					console.log('ISHOULDCALLBACK')
					callback(false)
				} else {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get stream list from Twitch.')
					callback(true)
				}
			})
		} else {
			Mikuia.log(Mikuia.LogStatus.Error, 'Failed to obtain channel list to refresh.')
			callback(true)
		}
	})
}

var r = repl.start('Mikuia> ')
r.context.Mikuia = Mikuia
