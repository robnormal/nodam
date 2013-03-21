var
	nodam = require('./nodam-basic.js'),
	_ = require('./curry.js'),
	R = require('./restriction.js'),
	M = require('./Maybe.js'),
	_slice = Array.prototype.slice;

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
			'get', 'all'
		],

		db_empty_err_funcs = [
			'run', 'exec', 'serialize', 'parallelize', 'loadExtension', 'close'
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
		return new nodam.AsyncMonad(function(apass) {
			apass.success(M.right(new dbMWrapper(file, mode)), apass.state);
		});
	};

	/**
	 * that - dbMWrapper
	 * method - method name
	 * desc - monad descriptor, as returned by describeMonad
	 */
	var sqlite3Callback = function(that, desc, apass) {
		return function(err, x) {
			if (err) {
				err.monad = desc;
				apass.success(M.left(err), apass.state);
			} else {
				apass.success(M.right(x) , apass.state);
			}
		};
	}

	/**
	 * For functions like run(), that pass nothing, make them pass the db
	 *
	 * that - dbMWrapper
	 * method - method name
	 * desc - monad descriptor, as returned by describeMonad
	 */
	var sqlite3Empty = function(that, desc, apass) {
		return function(err, x) {
			if (err) {
				err.monad = desc;
				apass.success(M.left(err), apass.state);
			} else {
				apass.success(M.right(that) , apass.state);
			}
		};
	}


	// this wrapper around Statement() allows easy conversion to IO monad
	function stmtM(query, callback) {
		this.stmt = new sql.Statement(query);

		// add passing of error to this callback
		callback(undefined, this);
	}

	function dbMethodToMonad(callback, method) {
		return function() {
			var
				that = this,
				args = _slice.apply(arguments),
				_stack = nodam.debugging() ? (new Error()).stack : '';

			return new nodam.AsyncMonad(function(apass) {
				var m_desc = describeMonad(method, method, that.db, args, _stack);

				try {
					that.db[method].apply(that.db, args.concat(
						callback(that, m_desc, apass))
					);
				} catch(err) {
					err.monad = m_desc;
					f(err);
				}
			});
		};
	}

	_.each(
		db_err_funcs,
		function(method) {
			dbMWrapper.prototype[method] = dbMethodToMonad(sqlite3Callback, method);
		}
	);

	_.each(
		db_empty_err_funcs,
		function(method) {
			dbMWrapper.prototype[method] = dbMethodToMonad(sqlite3Empty, method);
		}
	);

	dbMWrapper.prototype.reduce = function(sql, params, fM, memo) {
		var that = this;

		return new nodam.AsyncMonad(function(apass) {
			var
				state = apass.state,
				args = [sql]
					.concat(params)
					.concat([ function(row) {
							fM(memo, row).run(function(u, s) {
								memo = M.right(u);
								state = s;
							}, function(err) {
								memo = M.left(err);
							}, apass.state);
						}, function(err, num_rows) {
							if (err) {
								apass.success(M.left(err), state);
							} else {
								apass.success(M.right(memo), state);
							}
						}
					]);

			that.db.each.apply(that.db, args);
		});
	};

	if (_.debugging()) {
		dbMWrapper.prototype.get = R.restrictArgs(
			R.isTypeAt('string', 0),
			dbMWrapper.prototype.get
		);
	}
	return {
		database: database,
		statement: null
	};
})();

module.exports = lib;


