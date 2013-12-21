var app, express, Mikuia, passport

function ensureAuthenticated(req, res, next) {
	if(req.isAuthenticated()) {
		return next()
	}
	res.redirect('/login')
}

exports.init = function(m) {
	Mikuia = m
	express = require('express')
	passport = require('passport')
	redis = Mikuia.modules.redis
	twitch = require('passport-twitchtv').Strategy
	app = express()

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
	app.use(express.session({secret: 'wewillchangethislater'}))
	app.use(passport.initialize())
	app.use(passport.session())
	app.use(function(req, res, next) {
		res.locals.user = req.user
		next()
	})
	app.use(app.router)
	app.use(express.static(__dirname + '/www/public'))

	app.get('/', function(req, res) {
		res.render('index')
		redis.smembers('channels', function(err, data) {
			console.log(data)
		})
	})

	app.get('/auth/twitch', passport.authenticate('twitchtv', {scope: ['user_read']}))
	app.get('/auth/twitch/callback', passport.authenticate('twitchtv', {
		failureRedirect: '/login'
	}), function(req, res) {
		redis.sadd('channels', req.user._json.display_name)
		res.redirect('/')
	})

	app.get('/logout', function(req, res) {
		req.logout()
		res.redirect('/')
	})

	app.listen(5587)

}