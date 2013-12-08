var request = require('request')
var _ = require('underscore')

var osu = function(key) {
	this.key = key
}

osu.prototype.getBeatmap = function(beatmapId, type, callback) {
	request('http://osu.ppy.sh/api/get_beatmaps?k=' + this.key + '&' + type + '=' + beatmapId, function(error, response, body) {
		if(!error && body != '[]') {
			var json = JSON.parse(body)[0]
			callback(false, json)
		} else {
			callback(true, {})
		}
	})
}

osu.prototype.getUser = function(user, callback) {
	request('http://osu.ppy.sh/api/get_user?k=' + this.key + '&u=' + user, function(error, response, body) {
		if(!error) {
			var json = JSON.parse(body)[0]
			callback(false, json)
		} else {
			callback(true, {})
		}
	})
}

module.exports = osu