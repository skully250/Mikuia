var async = require('async')
var cli = require('cli-color')
var fs = require('fs')
var irc = require('irc')
var limiter = require('limiter').RateLimiter
var moment = require('moment')
var osuapi = require('./osuapi')
var Redis = require('redis')
var repl = require('repl')
var request = require('request')
var rollbar = require('rollbar')
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

var Mikuia = new function() {
	
	this.LogStatus = {
		Success: 'SUCCESS',
		Normal: 'INFO',
		Warning: 'WARN',
		Error: 'ERROR',
		Fatal: 'FATAL'
	}

	this.channels = {}
	this.channels2 = {}
	this.commands = {}
	this.enabled = {}
	this.hooks = {
		'10s': [],
		'1m': [],
		'5m': [],
		'1h': [],
		'chat': [],
		'enable': []
	}
	this.modules = {
		async: async,
		cli: cli,
		fs: fs,
		irc: irc,
		limiter: limiter,
		moment: moment,
		redis: redis,
		request: request,
		rollbar: rollbar,
		twitch: twitch,
		_: _
	}
	this.plugins = {}
	this.settings = {
		plugins: {}
	}
	this.streams = {}

	this.getChannel = function(channelName) {
		if(!_.isUndefined(channelName) && channelName.indexOf('#') == 0) {
			channelName = channelName.replace('#', '')
		}

		if(channelName in this.channels2) {
			return this.channels2[channelName]
		} else {
			this.channels2[channelName] = new Channel(channelName)
			return this.channels2[channelName]
		}
	}

	this.handleError = function(message) {
		rollbar.reportMessage(message)
	}

	this.handleMessage = function(from, channel, message) {
		var self = this
		if(message.indexOf('!') == 0) {
			var tokens = message.replace('!', '').split(' ')
			var trigger = tokens[0].toLowerCase()

			var commandObject = this.getChannel(channel).getCommand(trigger)

			if(commandObject != false) {
				var command = commandObject.command
				var pl = this.getChannel(channel).getPlugin(this.commands[command].plugin)
				if(!_.isUndefined(pl)) {
					this.plugins[this.commands[command].plugin].handleCommand(command, tokens, from, channel)
				}
			}
		} else {
			_.each(self.hooks.chat, function(pluginName) {
				if(self.channels[channel].plugins[pluginName] != undefined) {
					self.plugins[pluginName].handleMessage(from, channel, message)
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

	this.say = function(target, message) {
		twitchRateLimit.removeTokens(1, function(err, remainingRequests) {
			client.say(target, message)
			Mikuia.log(Mikuia.LogStatus.Warning, 'Remaining tokens: ' + remainingRequests)
		})
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

	this.update = function(channelName) {
		var self = this
		self.channels['#' + channelName] = {
			commands: {},
			display_name: channelName,
			plugins: {}
		}
		self.channels2[channelName] = new Channel(channelName)
		redis.smembers('channel:' + channelName + ':plugins', function(err, plugins) {
			if(err) {
				self.log(self.LogStatus.Error, 'Failed to get a list of plugins for ' + channelName + '.')
			}
			_.each(plugins, function(pluginName) {
				self.channels['#' + channelName].plugins[pluginName] = {}
				redis.get('channel:' + channelName + ':plugin:' + pluginName + ':settings', function(err2, settings) {
					if(err2) {
						self.log(self.LogStatus.Error, 'Failed to get a settings for plugin ' + pluginName + ' for channel ' + channelName + '.')
					} else {
						try {
							self.channels['#' + channelName].plugins[pluginName].settings = JSON.parse(settings)
						} catch(e) {
							self.log(self.LogStatus.Error, 'Failed to parse settings for plugin ' + pluginName + ' for channel ' + channelName + '.')
						}
						if(self.enabled[pluginName].indexOf('#' + channelName) == -1) {
							self.enabled[pluginName].push('#' + channelName)
							if(self.hooks.enable.indexOf(pluginName) > -1) {
								self.plugins[pluginName].load('#' + channelName)
							}
						}
					}
				})
			})
		})
		redis.smembers('channel:' + channelName + ':commands', function(err, commands) {
			if(err) {
				self.log(self.LogStatus.Error, 'Failed to get commands for channel ' + channelName + '.')
			} else {
				_.each(commands, function(commandName) {
					redis.get('channel:' + channelName + ':command:' + commandName, function(err2, command) {
						if(err2) {
							self.log(self.LogStatus.Error, 'Failed to get info for command ' + commandName + ' for channel ' + channelName + '.')
						} else {
							try {
								self.channels['#' + channelName].commands[commandName] = JSON.parse(command)
							} catch(e) {
								self.log(self.LogStatus.Error, 'Failed to parse JSON info for command ' + commandName + ' for channel ' + channelName + '.')
							}
							redis.get('channel:' + channelName + ':command:' + commandName + ':settings', function(err3, settings) {
								if(err3) {
									self.log(self.LogStatus.Error, 'Failed to get settings for command ' + commandName + ' for channel ' + channelName + '.')
								} else {
									try {
										self.channels['#' + channelName].commands[commandName].settings = JSON.parse(settings)
									} catch(e) {
										self.log(self.LogStatus.Error, 'Failed to parse JSON settings for command ' + commandName + ' for channel ' + channelName + '.')
									}
								}
							})
						}
					})
				})
			}
		})
	}
}

var channel = require('./models/Channel')
channel.init(Mikuia)
var Channel = channel.class

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
			rollbar.init(Mikuia.settings.plugins.base.rollbarToken)
			rollbar.handleUncaughtExceptions(Mikuia.settings.plugins.base.rollbarToken, { exitOnCaughtException: false })
			fs.writeFileSync('settings.json', JSON.stringify(Mikuia.settings, null, '\t'))
			Mikuia.runHooks('10s')
			Mikuia.runHooks('1h')
			www.init(Mikuia)
		})
	})
})

setInterval(function() {
	Mikuia.runHooks('10s')
}, 10000)

setInterval(function() {
	Mikuia.runHooks('1m')
}, 60000)

setInterval(function() {
	Mikuia.runHooks('5m')
	refreshViewers()
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
					Mikuia.update(channelName)
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

	refreshViewers()
}

function getViewers(callback) {
	redis.zrange('viewers', 0, -1, "WITHSCORES", function(err, data) {
		if(err) {
			Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get viewer list from Redis.')
		}
		callback(err, data)
	})
}

function refreshViewers() {
	redis.smembers('channels', function(err, channels) {
		if(err) {
			Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get channel list from Redis for refreshing viewers.')
		} else {
			async.each(channels, function(channel, callback) {
				twitch._get('streams/' + channel, function(err, stream) {
					if(!err && stream.req.res.body != undefined) {
						if(stream.req.res.body.stream != null) {
							//console.log(stream.req.res.body.stream)
							Mikuia.channels['#' + channel].display_name = stream.req.res.body.stream.channel.display_name
							Mikuia.streams['#' + channel] = stream.req.res.body.stream
							redis.zadd('viewers', stream.req.res.body.stream.viewers, channel)
						} else {
							delete Mikuia.streams['#' + channel]
							redis.zrem('viewers', channel)
						}
					} else {
						Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get a stream (' + channel + ').')
					}
					callback(err)
				})
			}, function(err) {
				if(err) {
					Mikuia.log(Mikuia.LogStatus.Error, 'One of the streams failed to refresh viewers.')
				}
			})
		}
	})
}

var r = repl.start('Mikuia> ')
r.context.Mikuia = Mikuia