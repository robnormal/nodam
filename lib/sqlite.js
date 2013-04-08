var
	util = require('util'),
	nodam = require('./nodam.js'),
	_ = require('./curry.js'),
	R = require('./restriction.js'),
	E = require('./Either.js');

var lib = (function () {
	var
		sql = require('sqlite3').verbose(),
		db_err_funcs = [
			'get', 'all'
		],

		db_empty_err_funcs = [
			'run', 'exec', 'serialize', 'parallelize', 'loadExtension', 'close'
		];

		/*
		stmt_funcs    = [
			'finalize', 'parallelize', 'close'
		],
		stmt_err_funcs = [
			'bind', 'reset', 'run', 'get', 'all'
		];
		*/


	function DBWrapper(file, mode) {
		// emits error event on failure
		this.io = new sql.Database(file, mode);
	}
	util.inherits(DBWrapper, nodam.IOWrapper);

	/**
	 * For functions like run(), that pass nothing, make them pass the db
	 *
	 * that - DBWrapper
	 * method - method name
	 * desc - monad descriptor, as returned by describeMonad
	 */
	var sqlite3Empty = function(apass, options, args, that) {
		return function(err, x) {
			if (err) {
				err.args = args;
				err.stack = (new Error()).stack;
				apass.success(E.left(err), apass.state);
			} else {
				apass.success(E.right(that) , apass.state);
			}
		};
	};

	/*
	// this wrapper around Statement() allows easy conversion to IO monad
	function stmtM(query, callback) {
		this.stmt = new sql.Statement(query);

		// add passing of error to this callback
		callback(undefined, this);
	}
	*/

	function monadizeDbMethod(name, options) {
		options = _.extend(options || {}, {
			library: 'sqlite',
			method: name
		});

		return nodam.monadize(name, options);
	}

	DBWrapper.prototype['all'] = monadizeDbMethod(
		'all', { errors: true, arity: 1 }
	);

	DBWrapper.prototype['get'] = monadizeDbMethod(
		'get', { errors: true, arity: 1, maybe: true }
	);

	_.each(
		db_empty_err_funcs,
		function(method) {
			DBWrapper.prototype[method] = monadizeDbMethod(
				method, { errors: true, callback: sqlite3Empty }
			);
		}
	);

	// use this instead of the sqlite3.database.each() function
	DBWrapper.prototype.reduce = function(sql, params, fM, memo) {
		var that = this;

		return new nodam.Async(function(apass) {
			var
				state = apass.state,
				args = [sql]
					.concat(params)
					.concat([ function(row) {
							fM(memo, row).run(function(u, s) {
								memo = E.right(u);
								state = s;
							}, function(err) {
								memo = E.left(err);
							}, apass.state);
						}, function(err, num_rows) {
							// ignore num rows
							if (err) {
								apass.success(E.left(err), state);
							} else {
								apass.success(E.right(memo), state);
							}
						}
					]);

			that.io.each.apply(that.io, args);
		});
	};

	if (_.debugging()) {
		DBWrapper.prototype.get = R.restrictArgs(
			R.isTypeAt('string', 0),
			DBWrapper.prototype.get
		);
	}

	var database = function(file, mode) {
		return new nodam.Async(function(apass) {
			apass.success(E.right(new DBWrapper(file, mode)), apass.state);
		});
	};

	return {
		database: database,
		statement: null
	};
})();

module.exports = lib;


