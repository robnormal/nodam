var nodam = require('./nodam.js');
var _ = require('./curry.js');
var _slice = Array.prototype.slice;

function describeMonad(name, method, db, args, stack) {
	var desc = {
		callback: name,
		library: 'sqlite3',
		method: method,
		owner: db,
		arguments: args
	};

	if (nodam.debugging()) desc.stack_at_origin = stack;

	return desc;
}

var lib = (function () {
	var
		sql = require('sqlite3').verbose(),
		db_err_funcs = [
			'run', 'exec', 'get', 'all', 'loadExtension',
			'serialize', 'parallelize', 'close'
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

	function dbMethodToMonad(method) {
		return function() {
			var
				self = this,
				args = _slice.apply(arguments),
				_stack = nodam.debugging() ? (new Error()).stack : '';

			return new nodam.AsyncMonad(function(r, f, state) {
				self.db[method].apply(self.db, args.concat(function(err, x) {
					var m_desc  = describeMonad(method, method, self.db, args, _stack);

					// if we only get one argument, pass the db object to the next function
					x = arguments.length > 1 ? x || self.db : undefined;

					if (err) {
						err.monad = m_desc;
						f(err);
					} else {
						try {
							r(x || self, state);
						} catch(err2) {
							err2.monad = m_desc;
							f(err2);
						}
					}
				}));
			});
		};
	}

	_.each(
		db_err_funcs, // not sure if there are others?
		function(method) {
			dbMWrapper.prototype[method] = dbMethodToMonad(method);
		});

	dbMWrapper.prototype.eachM = function(sql, params, fM) {
		var self = this;

		var _stack = nodam.debugging() ? (new Error()).stack : '';

		return new nodam.AsyncMonad(function(success, failure, s) {
			var
				results = [],
				errors = [],
				fail = function(err) { errors.push(err); },
				rowFunc = function(err, row) {
					if (err) {
						// currently there is no way to stop stop Database.each()...
						err.monad = describeMonad('eachM', 'eachM', self.db, [sql, params, fM], _stack);
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

			self.db.each.apply(self.db, params);
		});
	};

	return {
		database: database,
		statement: null
	};
})();

module.exports = lib;

