var app, async, connect, express, fs, io, Mikuia, passport, passportIo, redis, RedisStore, request, server, twitch, _

function ensureAuthenticated(req, res, next) {
	if(req.isAuthenticated()) {
		return next()
	}
	res.render('error', {
		message: 'You are not logged in!'
	})
}

exports.getApp = function() {
	return app
}

exports.init = function(m) {
	Mikuia = m
	async = require('async')
	connect = require('connect')
	express = require('express')
	fs = require('fs')
	passport = require('passport')
	passportIo = require('passport.socketio')
	redis = Mikuia.modules.redis
	RedisStore = require('connect-redis')(express)
	request = require('request')
	twitch = require('passport-twitchtv').Strategy
	_ = Mikuia.modules._
	app = express()
	server = require('http').createServer(app)
	io = require('socket.io').listen(server)

	server.listen(5587)

	var sessionStore = new RedisStore({
		client: redis,
		host: 'localhost'
	})

	io.set('authorization', passportIo.authorize({
		cookieParser: express.cookieParser,
		key: 'express.sid',
		secret: 'wewillchangethislater',
		store: sessionStore,
		success: function(data, accept) {
			//console.log(data)
			accept(null, true)
		},
		fail: function(data, message, error, accept) {
			console.log(message)
			accept(null, !error)
		}
	}))
	io.set('log level', 1)

	passport.deserializeUser(function(obj, done) {
		done(null, obj)
	})

	passport.serializeUser(function(user, done) {
		done(null, user)
	})

	passport.use(new twitch({
		clientID: Mikuia.settings.plugins.base.clientID,
		clientSecret: Mikuia.settings.plugins.base.clientSecret,
		callbackURL: Mikuia.settings.plugins.base.callbackURL
	}, function(accessToken, refreshToken, profile, done) {
		process.nextTick(function() {
			done(null, profile)
		})
	}))

	app.use(express.static(__dirname + '/public'))
	app.set('views', __dirname + '/views')
	app.set('view engine', 'jade')
	app.use(express.logger('dev'))
	app.use(express.cookieParser())
	app.use(express.bodyParser())
	app.use(express.session({
		key: 'express.sid',
		secret: 'wewillchangethislater',
		store: sessionStore
	}))
	app.use(passport.initialize())
	app.use(passport.session())
	app.use(function(req, res, next) {
		res.locals.isAjax = false
		res.locals.Mikuia = Mikuia
		res.locals.user = req.user
		next()
	})
	app.use(app.router)

	io.sockets.on('connection', function(socket) {

		var Channel = Mikuia.getChannel(socket.handshake.user.username)

		socket.on('ready', function() {
			// Yes
		})

		socket.on('commands.add', function(data) {
			Channel.addCommand(data.name, data.command, function(err) {
				if(!err) {
					socket.emit('commands:add', {
						name: data.name,
						command: data.command
					})
				} else {
					// TODO
				}				
			})
		})

		socket.on('commands.remove', function(data) {
			Channel.removeCommand(data.name, function(err) {
				if(!err) {
					socket.emit('commands:remove', {
						name: data.name
					})
				} else {
					// TODO
				}
			})
		})

		socket.on('commands.save', function(data) {
			Channel.setCommandSettings(data.name, data.settings, function(err, reply) {
				if(!err) {
					socket.emit('commands:save', {
						command: data.name
					})
				} else {
					// TODO
				}
			})
		})

		socket.on('dashboard.following', function(data) {
			Channel.getFollowing(function(err, reply) {
				if(!err) {

					var channels = {}
					var list = {
						streaming: [],
						online: [],
						offline: []
					}

					_.each(reply, function(channelName) {

						var chan = Mikuia.getChannel(channelName)
						var status = chan.getShortStatus()
						list[status].push(chan.getName())
						channels[chan.getName()] = {
							display_name: chan.getDisplayName(),
							logo: chan.getLogo(),
							state: chan.getShortStatus(),
							status: chan.getStatus()
						}
						if(chan.getIRCName() in Mikuia.streams) {
							channels[chan.getName()].viewers = Mikuia.streams[chan.getIRCName().viewers]
						}

					})

					list.streaming.sort()
					list.online.sort()
					list.offline.sort()

					var order = list.streaming.concat(list.online) //.concat(list.offline)

					socket.emit('dashboard:following', {
						channels: channels,
						order: order
					})
				} else {
					// TODO TOO
				}
			})
		})

		socket.on('getCommands', function() {
			var commands = {}

			_.each(Channel.getPlugins(), function(pluginName) {
				for(var commandKey in Mikuia.plugins[pluginName].manifest.commands) {
					var command = Mikuia.plugins[pluginName].manifest.commands[commandKey]
					commands[commandKey] = command
					commands[commandKey].plugin = pluginName
				}
			})

			socket.emit('commands', {
				commands: commands
			})

			_.each(Channel.getCommands(), function(element, key, list) {
				if(_.isObject(element) && element.command != undefined) {
					socket.emit('commands:add', {
						name: key,
						command: element.command,
						settings: element.settings
					})
				}
			})
		})

		socket.on('getSettings', function() {
			Channel.isEnabled(function(err, enabled) {
				if(!err) {
					socket.emit('settings', {
						enabled: enabled
					})
					socket.emit('apiKey', {
						apiKey: Channel.getInfo('apiKey')
					})
					if(enabled) {
						var plugins = {}

						_.each(Channel.getPlugins(), function(pluginName) {
							plugins[pluginName] = Mikuia.plugins[pluginName].manifest
						})

						socket.emit('settings:plugins', {
							plugins: plugins
						})

						_.each(plugins, function(element, key, list) {
							socket.emit('settings:plugin', {
								plugin: key,
								settings: Channel.getSettings(key)
							})
						})
					}
				} else {
					// TODO
				}
			})
		})

		socket.on('plugin.enable', function(data) {
			Channel.addPlugin(data.plugin, function(err, reply) {
				if(!err) {
					socket.emit('plugin:enable', {
						plugin: data.plugin
					})
				} else {
					// TODO
				}
			})
		})

		socket.on('plugin.disable', function(data) {
			Channel.removePlugin(data.plugin, function(err, reply) {
				if(!err) {
					socket.emit('plugin:disable', {
						plugin: data.plugin
					})
				} else {	
					// TODO
				}
			})
		})

		socket.on('settings.enable', function(data) {
			Channel.enable(function(err, reply) {
				if(!err) {
					socket.emit('settings:enable', {
						reply: reply
					})
				} else {
					// TODO
				}
			})
		})

		socket.on('settings.disable', function(data) {
			Channel.disable(function(err, reply) {
				if(!err) {
					socket.emit('settings:disable', {
						reply: reply
					})
				} else {
					// TODO
				}
			})
		})

		socket.on('settings.plugin', function(data) {
			Channel.setPluginSettings(data.plugin, data.settings, function(err, reply) {
				if(!err) {
					socket.emit('settings:plugin:save', {
						plugin: data.plugin,
						reply: reply
					})
				} else {
					// TODO
				}
			})
		})

	})

	var routes = {}

	routes.channels = function(req, res) {
		res.render('channels')
	}

	routes.command = function(req, res) {
		var file = req.params.command.replace('.', '_')
		if(req.params.command != undefined && fs.existsSync('views/commands/' + file + '.jade')) {
			res.render('commands/' + file)
		} else {
			res.render('error')
		}
	}

	routes.commands = function(req, res) {
		res.render('commands')
	}

	routes.dashboard = function(req, res) {
		res.render('dashboard')
	}

	routes.guide = function(req, res) {
		var wrongCommands = 0
		_.each(Mikuia.channels2, function(channel) {
			for(var command in channel.getCommands()) {
				if(command.indexOf('!') == 0) {
					wrongCommands++
				}
			}
		})
		res.render('guide', {
			wrongCommands: wrongCommands
		})
	}

	// routes.index = function(req, res) {
	// 	// async.parallel({
	// 	// 	// github: function(callback) {
	// 	// 	// 	request({
	// 	// 	// 		url: 'https://api.github.com/repos/Maxorq/Mikuia/commits',
	// 	// 	// 		headers: {
	// 	// 	// 			'User-Agent': 'Mikuia'
	// 	// 	// 		}
	// 	// 	// 	}, function(error, response, body) {
	// 	// 	// 		if(!error && response.statusCode == 200) {
	// 	// 	// 			callback(null, JSON.parse(body))
	// 	// 	// 		} else {
	// 	// 	// 			callback(error, null)
	// 	// 	// 		}
	// 	// 	// 	})
	// 	// 	// },
	// 	// 	redis: function(callback) {
	// 	// 		redis.zrange('viewers', 0, -1, "WITHSCORES", function(err, data) {
	// 	// 			callback(err, data)
	// 	// 		})
	// 	// 	}
	// 	// }, function(err, results) {
	// 		// if(err) {
	// 		// 	Mikuia.log(Mikuia.LogStatus.Error, 'Something went wrong while opening index page.')
	// 		// }
	// 		var channels = {}
	// 		var featuredChannel = {}
	// 		redis.zrange('viewers', 0, -1, "WITHSCORES", function(err, data) {
	//  			if(!err && data.length > 0) {
	// 				featuredChannel = Mikuia.getChannel(data[data.length - 2].toLowerCase())
	//  				channels = data
	//  			}
	// 	 		res.render('index', {
	// 				//changelog: github,
	// 				channels: channels,
	// 				featuredChannel: featuredChannel,
	// 				streams: Mikuia.streams
	// 			})
	//  		})
	// 		//var github = {}
	// 		// if(results.redis.length > 0) {
	// 		// }
	// 		// if(results.github != null) {
	// 		// 	github = results.github.splice(0, 14)
	// 		// }
			
	// 	//})
	// }

	routes.index = function(req, res) {
		res.render('index')
	}

	routes.plugins = function(req, res) {
		redis.smembers('channel:' + req.user.username + ':plugins', function(err, reply) {
			res.render('plugins', {
				installed: reply,
				plugins: Mikuia.plugins
			})
		})
	}

	routes.profile = function(req, res) {
		var channel = Mikuia.getChannel(req.params.username)
		res.render('profile', {
			channel: channel
		})
	}

	routes.settings = function(req, res) {
		res.render('settings')
	}

	app.get('/*', function(req, res, next) {
		if(req.isAuthenticated()) {
			var channel = Mikuia.getChannel(res.locals.user.username)
			channel.setInfo('bio', res.locals.user._json.bio)
			channel.setInfo('display_name', res.locals.user._json.display_name)
			channel.setInfo('email', res.locals.user._json.email)
			channel.setInfo('logo', res.locals.user._json.logo)
			if(!channel.getInfo('apiKey')) {
				var newKey = Array.apply(0, Array(32)).map(function() {
					return(function(charset) {
						return charset.charAt(Math.floor(Math.random() * charset.length))
					}('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'))
				}).join('')

				channel.setInfo('apiKey', newKey)
			}
		}
		next()
	})

	app.get('/ajax/?*', function(req, res, next) {
		res.locals.isAjax = true
		next()
	})

	app.get('/', routes.index)
	app.get('/ajax', routes.index)
	app.get('/channels', routes.channels)
	app.get('/ajax/channels', routes.channels)
	app.get('/channels', routes.channels)
	app.get('/command/:command', routes.command)
	app.get('/ajax/command/:command', routes.command)
	app.get('/commands', ensureAuthenticated, routes.commands)
	app.get('/ajax/commands', ensureAuthenticated, routes.commands)
	app.get('/dashboard', ensureAuthenticated, routes.dashboard)
	app.get('/ajax/dashboard', ensureAuthenticated, routes.dashboard)
	app.get('/guide', routes.guide)
	app.get('/ajax/guide', routes.guide)
	app.get('/settings', ensureAuthenticated, routes.settings)
	app.get('/ajax/settings', ensureAuthenticated, routes.settings)
	app.get('/plugins', ensureAuthenticated, routes.plugins)
	app.get('/ajax/plugins', ensureAuthenticated, routes.plugins)

	app.get('/channel/:username', routes.profile)
	app.get('/ajax/channel/:username', routes.profile)
	app.get('/profile/:username', routes.profile)
	app.get('/ajax/profile/:username', routes.profile)
	app.get('/user/:username', routes.profile)
	app.get('/ajax/user/:username', routes.profile)

	app.get('/auth/twitch', passport.authenticate('twitchtv', {scope: ['user_read']}))
	app.get('/auth/twitch/callback', passport.authenticate('twitchtv', {
		failureRedirect: '/login'
	}), function(req, res) {
		res.redirect('/')
	})

	app.get('/logout', function(req, res) {
		req.logout()
		res.redirect('/')
	})

	app.get('/alive', function(req, res) {
		res.send('Yes.')
	})

	app.get('/:username', function(req, res) {
		if(!_.isUndefined(req.params.username)) {
			var channel = Mikuia.getChannelIfExists(req.params.username)
			if(channel) {
				routes.profile(req, res)
			}
		} else {
			res.render('error', {
				message: 'That page doesn\'t exist. What are you doing? -.-'
			})
		}
	})

	app.get('/*', function(req, res) {
		res.render('error', {
			message: 'That page doesn\'t exist. What are you doing? -.-'
		})
	})
}