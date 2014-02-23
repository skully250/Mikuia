var app, async, connect, express, io, Mikuia, passport, passportIo, redis, RedisStore, request, server, twitch, _

function ensureAuthenticated(req, res, next) {
	if(req.isAuthenticated()) {
		return next()
	}
	res.render('error', {
		message: 'You are not logged in!'
	})
}

exports.init = function(m) {
	Mikuia = m
	async = require('async')
	connect = require('connect')
	express = require('express')
	passport = require('passport')
	passportIo = require('passport.socketio')
	redis = Mikuia.modules.redis
	RedisStore = require('connect-redis')(express)
	request = require('request')
	rollbar = require('rollbar')
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
		res.locals.user = req.user
		next()
	})
	app.use(app.router)

	app.use(rollbar.errorHandler(Mikuia.settings.plugins.base.rollbarToken))

	io.sockets.on('connection', function(socket) {

		if(socket.handshake.user.username == 'hatsuney') {
			var Channel = Mikuia.getChannel('kasugunai')
		} else {
			var Channel = Mikuia.getChannel(socket.handshake.user.username)
		}

		

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
				socket.emit('commands:add', {
					name: key,
					command: element.command,
					settings: element.settings
				})
			})
		})

		socket.on('getSettings', function() {
			Channel.isEnabled(function(err, enabled) {
				if(!err) {
					socket.emit('settings', {
						enabled: enabled
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

	routes.commands = function(req, res) {
		res.render('commands')
	}

	routes.guide = function(req, res) {
		var wrongCommands = 0
		_.each(Mikuia.channels, function(channel) {
			for(var command in channel.commands) {
				if(command.indexOf('!') == 0) {
					wrongCommands++
				}
			}
		})
		res.render('guide', {
			wrongCommands: wrongCommands
		})
	}

	routes.index = function(req, res) {
		async.parallel({
			// github: function(callback) {
			// 	request({
			// 		url: 'https://api.github.com/repos/Maxorq/Mikuia/commits',
			// 		headers: {
			// 			'User-Agent': 'Mikuia'
			// 		}
			// 	}, function(error, response, body) {
			// 		if(!error && response.statusCode == 200) {
			// 			callback(null, JSON.parse(body))
			// 		} else {
			// 			callback(error, null)
			// 		}
			// 	})
			// },
			redis: function(callback) {
				redis.zrange('viewers', 0, -1, "WITHSCORES", function(err, data) {
					callback(err, data)
				})
			}
		}, function(err, results) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Something went wrong while opening index page.')
			}
			var featuredChannel = {}
			//var github = {}
			if(results.redis.length > 0) {
				featuredChannel = Mikuia.channels['#' + results.redis[results.redis.length - 2].toLowerCase()]
			}
			// if(results.github != null) {
			// 	github = results.github.splice(0, 14)
			// }
			res.render('index', {
				//changelog: github,
				channels: results.redis,
				featuredChannel: featuredChannel,
				streams: Mikuia.streams
			})
		})
	}

	routes.plugins = function(req, res) {
		redis.smembers('channel:' + req.user.username + ':plugins', function(err, reply) {
			res.render('plugins', {
				installed: reply,
				plugins: Mikuia.plugins
			})
		})
	}

	routes.settings = function(req, res) {
		res.render('settings')
	}

	app.get('/ajax/?*', function(req, res, next) {
		res.locals.isAjax = true
		next()
	})

	app.get('/', routes.index)
	app.get('/ajax/', routes.index)
	app.get('/channels', routes.channels)
	app.get('/ajax/channels', routes.channels)
	app.get('/channels', routes.channels)
	app.get('/commands', ensureAuthenticated, routes.commands)
	app.get('/ajax/commands', ensureAuthenticated, routes.commands)
	app.get('/guide', routes.guide)
	app.get('/ajax/guide', routes.guide)
	app.get('/settings', ensureAuthenticated, routes.settings)
	app.get('/ajax/settings', ensureAuthenticated, routes.settings)
	app.get('/plugins', ensureAuthenticated, routes.plugins)
	app.get('/ajax/plugins', ensureAuthenticated, routes.plugins)

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

	app.post('/post', function(req, res) {
		Mikuia.log(Mikuia.LogStatus.Normal, 'Incoming played track!')
		console.log(req.body)
		res.send(200)
	})
}