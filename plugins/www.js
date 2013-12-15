var app
var express
var Mikuia

exports.init = function(m) {
	Mikuia = m
	express = require('express')
	app = express()

	app.set('views', __dirname + '/www/views')
	app.set('view engine', 'jade')
	app.use(express.logger('dev'))
	app.use(express.static(__dirname + '/www/public'))

	app.get('/', function(req, res) {
		res.render('index')
	})

	app.listen(5587)

}