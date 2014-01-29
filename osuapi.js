var request = require('request')
var _ = require('underscore')

var osu = function(key) {
	this.key = key
}

osu.prototype.getBeatmap = function(beatmapId, type, callback) {
	request('http://osu.ppy.sh/api/get_beatmaps?k=' + this.key + '&' + type + '=' + beatmapId, function(error, response, body) {
		if(!error) {
			try {
				var json = JSON.parse(body)
			} catch(e) {
				Mikuia.log(Mikuia.LogStatus.Error, 'osu - Failed to parse /' + type + '/' + beatmapId + ' JSON.')
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
				callback(true, {})
			}
		} else {
			Mikuia.log(Mikuia.LogStatus.Error, 'osu - Failed to get /' + type + '/' + beatmapId + ' JSON.')
			callback(true, {})
		}
	})
}

osu.prototype.getUser = function(user, callback) {
	request('http://osu.ppy.sh/api/get_user?k=' + this.key + '&u=' + user, function(error, response, body) {
		if(!error) {
			try {
				var json = JSON.parse(body)[0]
			} catch(e) {
				Mikuia.log(Mikuia.LogStatus.Error, 'osu - Failed to parse /u/' + user + ' JSON.')
			}
			if(json != undefined) {
				callback(false, json)
			} else {
				callback(true, {})
			}
		} else {
			Mikuia.log(Mikuia.LogStatus.Error, 'osu - Failed to get /u/' + user + ' JSON.')
			callback(true, {})
		}
	})
}

module.exports = osu