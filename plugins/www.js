var app, async, connect, express, Mikuia, passport, passportIo, redis, RedisStore, twitch, _

exports.manifest = {
	name: 'www',
	fullName: 'Website',
	description: 'Oh my god, a website.',
	type: 'server'
}

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
	async = Mikuia.modules.async
	connect = require('connect')
	express = require('express.io')
	passport = require('passport')
	passportIo = require('passport.socketio')
	redis = Mikuia.modules.redis
	RedisStore = require('connect-redis')(connect)
	twitch = require('passport-twitchtv').Strategy
	_ = Mikuia.modules._
	app = express()
	app.http().io()

	var sessionStore = new RedisStore({
		client: redis,
		host: 'localhost'
	})

	app.io.set('authorization', passportIo.authorize({
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

	app.set('views', __dirname + '/www/views')
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
	app.use(express.static(__dirname + '/www/public'))

	app.io.route('ready', function(req) {
		//console.log(req.handshake.user)
	})

	app.io.route('commands.add', function(req) {
		redis.sadd('channel:' + req.handshake.user.username + ':commands', req.data.name, function(err, reply) {
			redis.set('channel:' + req.handshake.user.username + ':command:' + req.data.name, JSON.stringify({command: req.data.command}), function(err2, reply2) {
				req.io.emit('commands:add', {
					name: req.data.name,
					command: req.data.command
				})
				Mikuia.update(req.handshake.user.username)
			})
		})
	})

	app.io.route('commands.remove', function(req) {
		redis.srem('channel:' + req.handshake.user.username + ':commands', req.data.name, function(err, reply) {
			redis.set('channel:' + req.handshake.user.username + ':command:' + req.data.name, '', function(err2, reply2) {
				req.io.emit('commands:remove', {
					name: req.data.name
				})
				Mikuia.update(req.handshake.user.username)
			})
		})
	})

	app.io.route('getCommands', function(req) {
		redis.smembers('channel:' + req.handshake.user.username + ':plugins', function(err, reply) {
			var commands = {}
			_.each(reply, function(pluginName) {
				for(var commandKey in Mikuia.plugins[pluginName].manifest.commands) {
					var command = Mikuia.plugins[pluginName].manifest.commands[commandKey]
					commands[commandKey] = command
					commands[commandKey].plugin = pluginName
				}
			})
			req.io.emit('commands', {
				commands: commands
			})
			redis.smembers('channel:' + req.handshake.user.username + ':commands', function(err2, reply2) {
				_.each(reply2, function(command) {
					redis.get('channel:' + req.handshake.user.username + ':command:' + command, function(err3, reply3) {
						var data = JSON.parse(reply3)
						req.io.emit('commands:add', {
							name: command,
							command: data.command
						})
					})
				})
			})
		})
	})

	app.io.route('getSettings', function(req) {
		redis.sismember('channels', req.handshake.user.username, function(err, reply) {
			req.io.emit('settings', {
				enabled: reply
			})
			if(reply) {
				redis.smembers('channel:' + req.handshake.user.username + ':plugins', function(err, reply) {
					var plugins = {}
					_.each(reply, function(pluginName) {
						plugins[pluginName] = Mikuia.plugins[pluginName].manifest
					})
					req.io.emit('settings:plugins', {
						plugins: plugins
					})
					async.each(Object.keys(plugins), function(item, callback) {
						redis.get('channel:' + req.handshake.user.username + ':plugin:' + item + ':settings', function(err, reply) {
							var data = JSON.parse(reply)
							req.io.emit('settings:plugin', {
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

	app.io.route('plugin.enable', function(req) {
		redis.sadd('channel:' + req.handshake.user.username + ':plugins', req.data.plugin, function(err, reply) {
			req.io.emit('plugin:enable', {
				plugin: req.data.plugin
			})
			Mikuia.update(req.handshake.user.username)
		})
	})

	app.io.route('plugin.disable', function(req) {
		redis.srem('channel:' + req.handshake.user.username + ':plugins', req.data.plugin, function(err, reply) {
			req.io.emit('plugin:disable', {
				plugin: req.data.plugin
			})
			var index = Mikuia.enabled[req.data.plugin].indexOf(req.handshake.user.username)
			Mikuia.enabled[req.data.plugin].splice(index, 1)
			Mikuia.update(req.handshake.user.username)
		})
	})


	app.io.route('settings.enable', function(req) {
		redis.sadd('channels', req.handshake.user.username, function(err, reply) {
			req.io.emit('settings:enable', {
				reply: reply
			})
		})
		redis.sadd('channel:' + req.handshake.user.username + ':plugins', 'base', function(err, reply) {
			Mikuia.joinChannel(req.handshake.user.username)
			Mikuia.update(req.handshake.user.username)
			redis.smembers('channel:' + req.handshake.user.username + ':plugins', function(err2, reply2) {
				var plugins = {}
				_.each(reply2, function(pluginName) {
					plugins[pluginName] = Mikuia.plugins[pluginName].manifest
				})
				req.io.emit('settings:plugins', {
					plugins: plugins
				})
			})
		})
	})

	app.io.route('settings.disable', function(req) {
		redis.srem('channels', req.handshake.user.username, function(err, reply) {
			req.io.emit('settings:disable', {
				reply: reply
			})
			Mikuia.leaveChannel(req.handshake.user.username, 'Disabled via website.')
			Mikuia.update(req.handshake.user.username)
		})
	})

	app.io.route('settings.plugin', function(req) {
		redis.set('channel:' + req.handshake.user.username + ':plugin:' + req.data.plugin + ':settings', JSON.stringify(req.data.settings), function(err, reply) {
			req.io.emit('settings:plugin:save', {
				plugin: req.data.plugin,
				reply: reply
			})
			Mikuia.update(req.handshake.user.username)
		})
	})

	var routes = {}

	routes.commands = function(req, res) {
		res.render('commands')
	}

	routes.index = function(req, res) {
		res.render('index')
		redis.smembers('channels', function(err, data) {
			console.log(data)
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
	app.get('/commands', ensureAuthenticated, routes.commands)
	app.get('/ajax/commands', ensureAuthenticated, routes.commands)
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

	app.listen(5587)

}