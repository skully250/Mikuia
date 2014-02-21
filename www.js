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

		socket.on('ready', function() {
			// Yes
		})

		socket.on('commands.add', function(data) {
			Mikuia.channels2[socket.handshake.user.username].addCommand(data.name, data.command, function(err, commandName, command) {
				socket.emit('commands:add', {
					name: data.name,
					command: data.command
				})
			})
		})

		socket.on('commands.remove', function(data) {
			redis.srem('channel:' + socket.handshake.user.username + ':commands', data.name, function(err, reply) {
				redis.set('channel:' + socket.handshake.user.username + ':command:' + data.name, '', function(err2, reply2) {
					socket.emit('commands:remove', {
						name: data.name
					})
					Mikuia.update(socket.handshake.user.username)
				})
			})
		})

		socket.on('commands.save', function(data) {
			redis.set('channel:' + socket.handshake.user.username + ':command:' + data.name + ':settings', JSON.stringify(data.settings), function(err, reply) {
				socket.emit('commands:save', {
					command: data.name,
					reply: reply
				})
				Mikuia.update(socket.handshake.user.username)
			})
		})

		socket.on('getCommands', function() {
			redis.smembers('channel:' + socket.handshake.user.username + ':plugins', function(err, reply) {
				var commands = {}
				_.each(reply, function(pluginName) {
					for(var commandKey in Mikuia.plugins[pluginName].manifest.commands) {
						var command = Mikuia.plugins[pluginName].manifest.commands[commandKey]
						commands[commandKey] = command
						commands[commandKey].plugin = pluginName
					}
				})
				socket.emit('commands', {
					commands: commands
				})
				redis.smembers('channel:' + socket.handshake.user.username + ':commands', function(err2, reply2) {
					_.each(reply2, function(command) {
						redis.get('channel:' + socket.handshake.user.username + ':command:' + command, function(err3, reply3) {
							var data = JSON.parse(reply3)
							redis.get('channel:' + socket.handshake.user.username + ':command:' + command + ':settings', function(err4, reply4) {
								var settings = {}
								try {
									settings = JSON.parse(reply4)
								} catch(e) {
									console.log(e)
								}
								socket.emit('commands:add', {
									name: command,
									command: data.command,
									settings: settings
								})
							})
						})
					})
				})
			})
		})

		socket.on('getSettings', function() {
			redis.sismember('channels', socket.handshake.user.username, function(err, reply) {
				socket.emit('settings', {
					enabled: reply
				})
				if(reply) {
					redis.smembers('channel:' + socket.handshake.user.username + ':plugins', function(err, reply) {
						var plugins = {}
						_.each(reply, function(pluginName) {
							plugins[pluginName] = Mikuia.plugins[pluginName].manifest
						})
						socket.emit('settings:plugins', {
							plugins: plugins
						})
						async.each(Object.keys(plugins), function(item, callback) {
							redis.get('channel:' + socket.handshake.user.username + ':plugin:' + item + ':settings', function(err, reply) {
								var data = JSON.parse(reply)
								socket.emit('settings:plugin', {
									plugin: item,
									settings: data
								})
							})
						}, function(err) {
							// oh dear
						})
					})
				}
			})
		})

		socket.on('plugin.enable', function(data) {
			redis.sadd('channel:' + socket.handshake.user.username + ':plugins', data.plugin, function(err, reply) {
				socket.emit('plugin:enable', {
					plugin: data.plugin
				})
				Mikuia.update(socket.handshake.user.username)
			})
		})

		socket.on('plugin.disable', function(data) {
			redis.srem('channel:' + socket.handshake.user.username + ':plugins', data.plugin, function(err, reply) {
				socket.emit('plugin:disable', {
					plugin: data.plugin
				})
				var index = Mikuia.enabled[data.plugin].indexOf(socket.handshake.user.username)
				Mikuia.enabled[data.plugin].splice(index, 1)
				Mikuia.update(socket.handshake.user.username)
			})
		})


		socket.on('settings.enable', function(data) {
			redis.sadd('channels', socket.handshake.user.username, function(err, reply) {
				socket.emit('settings:enable', {
					reply: reply
				})
			})
			redis.sadd('channel:' + socket.handshake.user.username + ':plugins', 'base', function(err, reply) {
				Mikuia.joinChannel(socket.handshake.user.username)
				Mikuia.update(socket.handshake.user.username)
				redis.smembers('channel:' + socket.handshake.user.username + ':plugins', function(err2, reply2) {
					var plugins = {}
					_.each(reply2, function(pluginName) {
						plugins[pluginName] = Mikuia.plugins[pluginName].manifest
					})
					socket.emit('settings:plugins', {
						plugins: plugins
					})
				})
			})
		})

		socket.on('settings.disable', function(data) {
			redis.srem('channels', socket.handshake.user.username, function(err, reply) {
				socket.emit('settings:disable', {
					reply: reply
				})
				Mikuia.leaveChannel(socket.handshake.user.username, 'Disabled via website.')
				Mikuia.update(socket.handshake.user.username)
			})
		})

		socket.on('settings.plugin', function(data) {
			redis.set('channel:' + socket.handshake.user.username + ':plugin:' + data.plugin + ':settings', JSON.stringify(data.settings), function(err, reply) {
				socket.emit('settings:plugin:save', {
					plugin: data.plugin,
					reply: reply
				})
				Mikuia.update(socket.handshake.user.username)
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