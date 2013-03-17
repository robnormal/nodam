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

	/**
	 * that - dbMWrapper
	 * method - method name
	 * desc - monad descriptor, as returned by describeMonad
	 */
	var sqlite3Callback = function(that, method, desc, r, f, state) {
		return function(err, x) {
			// if we only get one argument, pass the db object to the next function
			x = arguments.length > 1 ? x || that.db : undefined;

			if (err) {
				err.monad = desc;
				f(err);
			} else {
				try {
					r(x || that, state);
				} catch(err2) {
					err2.monad = desc;
					f(err2);
				}
			}
		};
	}

	// this wrapper around Statement() allows easy conversion to IO monad
	function stmtM(query, callback) {
		this.stmt = new sql.Statement(query);

		// add passing of error to this callback
		callback(undefined, this);
	}

	function dbMethodToMonad(method) {
		return function() {
			var
				that = this,
				args = _slice.apply(arguments),
				_stack = nodam.debugging() ? (new Error()).stack : '';

			return new nodam.AsyncMonad(function(r, f, state) {
				var m_desc = describeMonad(method, method, that.db, args, _stack);

				try {
					that.db[method].apply(that.db, args.concat(
						sqlite3Callback(that, method, m_desc, r, f, state))
					);
				} catch(err) {
					err.monad = m_desc;
					f(err);
				}
			});
		};
	}

	_.each(
		db_err_funcs, // not sure if there are others?
		function(method) {
			dbMWrapper.prototype[method] = dbMethodToMonad(method);
		});

	dbMWrapper.prototype.eachM = function(sql, params, fM) {
		var that = this;

		var _stack = nodam.debugging() ? (new Error()).stack : '';

		return new nodam.AsyncMonad(function(success, failure, s) {
			var
				results = [],
				m_desc = describeMonad('eachM', 'eachM', that.db, [sql, params, fM], _stack),
				rowFunc = function(err, row) {
					if (err) {
						// currently there is no way to stop stop Database.each()...
						err.monad = m_desc;
						failure(err);
					} else {
						fM(row).run(
							function(val) { results.push(val); },
							failure
						);
					}
				},
				completionFunc = function(err2, num_rows) {
					try {
						success(results, s);
					} catch(err2) {
						err2.monad = m_desc;
						failure(err2);
					}
				};

			// Database.each takes it's sql, parameters, and callbacks in a flat list
			params.unshift(sql);
			params.push(rowFunc, completionFunc);

			try {
				that.db.each.apply(that.db, params);
			} catch(err3) {
				err3.monad = m_desc;
				failure(err3);
			}
		});
	};

	return {
		database: database,
		statement: null
	};
})();

module.exports = lib;

