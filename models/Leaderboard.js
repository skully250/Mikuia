var Mikuia, _

exports.init = function(a) {
	Mikuia = a
	_ = Mikuia.modules._
}

exports.class = function(id) {
	this.id = id
	this.data = {}
	this.lb = []
	this.scores = {}
	this.settings = {}

	this.getData = function(name) {
		return this.data[name]
	}

	this.getLeaderboard = function() {
		return this.lb
	}

	this.getName = function() {
		return this.id
	}

	this.getScore = function(name) {
		return this.scores[name]
	}

	this.getScores = function() {
		return this.scores
	}

	this.getSettings = function() {
		return this.settings
	}

	this.load = function() {
		var self = this
		Mikuia.modules.redis.get('leaderboard:' + this.getName(), function(err, lbData) {
			if(!err) {
				var data = null
				try {
					data = JSON.parse(lbData)
				} catch(e) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse leaderboard ' + self.getName() + '.')
				}
				if(data) {
					self.lb = data.lb
					self.scores = data.scores
					self.settings = data.settings
				}
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load leaderboard ' + self.getName() + '.')
			}
		})
	}

	this.remove = function(name) {
		delete this.data[name]
		delete this.scores[name]
		delete this.lb[name]
		this.save()
	}

	this.removeAll = function() {
		this.data = {}
		this.lb = []
		this.scores = {}
		this.save()
	}

	this.save = function() {
		var self = this
		Mikuia.modules.redis.set('leaderboard:' + this.getName(), JSON.stringify({
			lb: this.getLeaderboard(),
			scores: this.getScores(),
			settings: this.getSettings()
		}), function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to save info for leaderboard ' + self.getName() + '.')
			}
		})
	}

	this.setData = function(name, data) {
		this.data[name] = data
	}

	this.setSettings = function(settings) {
		this.settings = settings
	}

	this.sort = function() {
		var self = this
		this.lb = _.sortBy(Object.keys(this.scores), function(name) { return self.scores[name] * -1 })
		this.save()
	}

	this.updateAll = function(name, data, score) {
		this.setData(name, data)
		this.updateScore(name, score)
	}

	this.updateScore = function(name, score) {
		this.scores[name] = score
		this.sort()
	}

	this.load()
}