var limiter = require('limiter')
var request = require('request')
var _ = require('underscore')

var apiRateLimiter = new limiter.RateLimiter(120, 'minute')

var osu = function(key) {
	this.key = key
}

osu.prototype.getBeatmap = function(beatmapId, type, callback) {
	var self = this
	apiRateLimiter.removeTokens(1, function(err, remainingRequests) {
		request('http://osu.ppy.sh/api/get_beatmaps?k=' + self.key + '&' + type + '=' + beatmapId, function(error, response, body) {
			if(!error) {
				var err
				try {
					var json = JSON.parse(body)
				} catch(e) {
					
				}
				if(json != undefined) {
					var maxRating = 0
					var select = 0
					_.each(json, function(value, key, list) {
						if(value.difficultyrating > maxRating && value.mode == 0) {
							maxRating = value.difficultyrating
							select = key
						}
					})
					//console.log(json)
					callback(false, json[select])
				} else {
					callback(true, 'osu - Failed to parse /' + type + '/' + beatmapId + ' JSON.')
				}
			} else {
				callback(true, 'osu - Failed to get /' + type + '/' + beatmapId + ' JSON.')
			}
		})
		console.log('osu!api tokens left: ' + remainingRequests)
	})
}

osu.prototype.getUser = function(user, mode, callback) {
	var self = this
	apiRateLimiter.removeTokens(1, function(err, remainingRequests) {
		request('http://osu.ppy.sh/api/get_user?k=' + self.key + '&u=' + user + '&m=' + mode, function(error, response, body) {
			if(!error) {
				try {
					var json = JSON.parse(body)[0]
				} catch(e) {
					console.log('D:')
				}
				if(json != undefined) {
					callback(false, json)
				} else {
					callback(true, 'osu - Failed to parse /u/' + user + ' JSON.')
				}
			} else {
				callback(true, 'osu - Failed to get /u/' + user + ' JSON.')
			}
		})
		console.log('osu!api tokens left: ' + remainingRequests)
	})
}

module.exports = osu
