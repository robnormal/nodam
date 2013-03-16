var nodam = require('./nodam.js');
var _ = require('./curry.js');
var _slice = Array.prototype.slice;

var lib = (function () {
	var
		sql = require('sqlite3').verbose(),
		lib = {},

		db_funcs    = [
			'serialize', 'parallelize', 'close'
		],
		db_err_funcs = [
			'get', 'all', 'loadExtension'
		],

		stmt_funcs    = [
			'finalize', 'parallelize', 'close'
		],
		stmt_err_funcs = [
			'bind', 'reset', 'run', 'get', 'all'
		];


	function dbMWrapper(file, mode) {
		// emits error event on failure
		this.db = new sql.Database(file, mode);
	}

	var database = function(file, mode) {
		return new nodam.AsyncMonad(function(success, failure, s) {
			success(new dbMWrapper(file, mode), s);
		});
	};

	// this wrapper around Statement() allows easy conversion to IO monad
	function stmtM(query, callback) {
		this.stmt = new sql.Statement(query);

		// add passing of error to this callback
		callback(undefined, this);
	}

	// add method to database class, passing the db object as first argument
	function addToPrototype(construct, method) {
		construct.prototype[method] = function() {
			var args = _slice.apply(arguments);
			args.unshift(this.db);

			return lib[method].apply(this, args);
		};
	}

	_.each(db_funcs, function(f) {
		lib[f] = nodam.toAsyncMonad(f, { method: true });
		addToPrototype(dbMWrapper, f);
	});

	_.each(db_err_funcs, function(f) {
		lib[f] = nodam.errorPassingToAsyncMonad(f, { method: true });
		addToPrototype(dbMWrapper, f);
	});

	function maybeErrorToMonad(method, options) {
		return function() {
			var args = _slice.apply(arguments);

			var self = this;

			return new nodam.AsyncMonad(function(runMe, fail, s) {
				self
					.db[method]
					.apply(self.db, args.concat(function(err) {
							// first argument is an error, or null if success
							if (arguments[0]) {
								fail(arguments[0]);
							} else {
								runMe(self, s);
							}
						})
					);
			});
		};
	}

	_.each(
		['exec'], // not sure if there are others?
		function(method) {
			dbMWrapper.prototype[method] = maybeErrorToMonad(method);
		});

	dbMWrapper.prototype.get = function(sql, params) {
		if (! sql) throw new Error('No SQL statement was passed');
		params = params || [];

		var self = this;
		return new nodam.AsyncMonad(function(r, f, state) {
			self.db.get(sql, params, function(err, row) {
				if (err) {
					f(err);
				} else {
					r(row, state);
				}
			});
		});
	};

	dbMWrapper.prototype.run = function(sql, params) {
		if (! sql) throw new Error('No SQL statement was passed');

		params = params || [];

		var self = this;
		return new nodam.AsyncMonad(function(r, f, state) {
			self.db.run(sql, params, function(err) {
				if (err) {
					f(err);
				} else {
					r(self, state);
				}
			});
		});
	};


	dbMWrapper.prototype.serialize = function() {
		var self = this;

		return new nodam.AsyncMonad(function(s, f, state) {
			self.db.serialize(function() {
				s(undefined, state);
			});
		});
	}

	dbMWrapper.prototype.eachM = function(sql, params, fM) {
		var me = this;

		return new nodam.AsyncMonad(function(success, failure, s) {
			var
				results = [],
				errors = [],
				fail = function(err) { errors.push(err); },
				rowFunc = function(err, row) {
					if (err) {
						// currently there is no way to stop stop Database.each()...
						fail(err);
					} else {
						fM(row).run(
							function(val) { results.push(val); },
							fail
						);
					}
				}, completionFunc = function(err, num_rows) {
					if (err) errors.push(err);

					if (errors.length) {
						failure(errors);
					} else {
						success(results, s);
					}
				};

			// Database.each takes it's sql, parameters, and callbacks in a flat list
			params.unshift(sql);
			params.push(rowFunc, completionFunc);

			me.db.each.apply(me.db, params);
		});
	};

	return {
		database: database,
		statement: null
	};
})();

module.exports = lib;

