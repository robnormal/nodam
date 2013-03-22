/*jshint node: true */

var
	_    = require('../lib/curry.js'),
	mb   = require('../lib/Maybe.js'),
	M    = require('../lib/nodam.js'),
	sqlM = require('../lib/sqlite.js'),
	sql  = require('sqlite3');

var path1 = __dirname + '/fixtures/monadTest.txt';
var path2 = __dirname + '/fixtures/monadTest2.txt';
var path3 = __dirname + '/fixtures/monadTest3.txt';

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

function getTime() {
	return (new Date()).getTime();
}

function monadErr(assert, msg) {
	return function(err) {
		assert.ok(false, msg || ('Monad error: ' + err));
	};
}

var openDB = sqlM.database(':memory:');
var createFoo = openDB .pipe(function(db) {
	return db .run('CREATE TABLE foo (bar TEXT)');
});

module.exports = {
	'database() returns dbM object': function(beforeExit, assert) {
		var count = 0;

		openDB .mmap(function(db_open) {
			assert.ok(db_open.db instanceof sql.Database);
			count++;
		}).run(function() {
			count++;
		}, function(err) {
			assert.ok(false, 'database() produced an error: ' + err);
		}, {});

		beforeExit(function() {
			assert.equal(count, 2);
		});

	},

	'run() runs a query, and results in the db object': function(beforeExit, assert) {
		var count = 0;

		createFoo
			.mmap(function(dbM) {
				var is_db = dbM && dbM.db && dbM.db instanceof sql.Database;

				assert.ok(is_db);
				count++;
			
				if (is_db)
					dbM.db.get('SELECT COUNT(*) + 3 AS c FROM foo', function(err, row) {
						assert.ok( !err ); // should be no errors
						assert.equal(row.c, 3); // no rows in foo

						count++;
					});
				}
			).run(function() {
				count++;
			}, monadErr(assert), {});

		beforeExit(function() {
			assert.equal(count, 3);
		});
	},

	'get() gets a row': function(beforeExit, assert) {
		var count = 0;

		createFoo .pipe(function(db) {
			return db.run("INSERT INTO foo VALUES ('cade')")
				.then(db.get('SELECT * FROM foo'))
				.mmap(function(row) {
					assert.equal(row.bar, 'cade');
					count++;
				});
		}).run(function() { count++ }, monadErr(assert), {});

		beforeExit(function() {
			assert.equal(count, 2);
		});
	},

	'all() gets many rows': function(beforeExit, assert) {
		var count = 0;

		createFoo .pipe(function(db) {
			return db
				.run("INSERT INTO foo VALUES ('alice')")
				.then(db.run("INSERT INTO foo VALUES ('bob')"))
				.then(db.run("INSERT INTO foo VALUES ('eve')"))
				.then(db.all('SELECT * FROM foo'))
				.mmap(function(rows) {
					assert.equal(rows.length, 3);
					assert.equal(rows[0] && rows[0].bar, 'alice');
					assert.equal(rows[2] && rows[2].bar, 'eve');
					count++;
				});
		}).run(function() { count++ }, monadErr(assert), {});

		beforeExit(function() {
			assert.equal(count, 2);
		});
	},

	/*
	'eachM() loops over rows': function(beforeExit, assert) {
		var count = 0;

		createFoo .pipe(function(db) {
			return db
				.run("INSERT INTO foo VALUES ('alice')")
				.then(db.run("INSERT INTO foo VALUES ('bob')"))
				.then(db.run("INSERT INTO foo VALUES ('eve')"))
				.then(
					db.eachM('SELECT * FROM foo', [], function(row) {
						return M.result(row && row.bar);
					})
				).mmap(function(names) {
					assert.equal(names.length, 3);
					assert.equal(names[0], 'alice');
					assert.equal(names[2], 'eve');

					count++;
				});
		}).run(function() { count++ }, monadErr(assert), {});

		beforeExit(function() {
			assert.equal(count, 2);
		});
	},
	*/

	'sqlite monadic methods preserve state': function(beforeExit, assert) {
		var
			dropQuery = 'DROP TABLE foo',
			err = monadErr(assert),
			set1 = M.set('alice', 'bob'),
			set2 = M.set('foo', 'bar'),
			state = {};

		// database()
		set1 .then(openDB) .run(function(u, s) {
			assert.ok(s);
			if (s) {
				assert.equal(s.alice, 'bob');
			}
		}, err, state);

		// set between each step
		var checkSets = function(fM) {
			set1
				.then(openDB)
				.pipe(function(db) {
					return set2
						.then(fM(db))
						.set('say', 'cheese');
				})
				.run(function(u, s) {
					assert.ok(s);

					if (s) {
						assert.equal(s.alice, 'bob');
						assert.equal(s.foo, 'bar');
						assert.equal(s.say, 'cheese');
					}
				}, err, state);
		};

		// run
		checkSets(function(db) {
			return db.run('CREATE TABLE foo (bar TEXT)');
		});

		// exec
		checkSets(function(db) {
			return db.exec('CREATE TABLE foo (bar TEXT)');
		});

		// get
		checkSets(function(db) {
			return db.run('CREATE TABLE foo (bar TEXT)')
				.then(db.run("INSERT INTO foo VALUES ('jim')"))
				.then(db.get("SELECT * FROM foo"));
		});

		// all
		checkSets(function(db) {
			return db.run('CREATE TABLE foo (bar TEXT)')
				.then(db.run("INSERT INTO foo VALUES ('jim')"))
				.then(db.run("INSERT INTO foo VALUES ('sue')"))
				.then(db.all("SELECT * FROM foo"));
		});

		// serialize
		checkSets(function(db) {
			return db.serialize();
		});

		// parallelize
		checkSets(function(db) {
			return db.serialize();
		});

		/*
		// each
		checkSets(function(db) {
			return db.run('CREATE TABLE foo (bar TEXT)')
				.then(db.run("INSERT INTO foo VALUES ('jim')"))
				.then(db.run("INSERT INTO foo VALUES ('sue')"))
				.then(db.eachM("SELECT * FROM foo", [], M.result));
		});
		*/

		// get()
		set1 .then(openDB) .pipe(function(db) {
			return M.set('foo', 'bar') .then(
				db.get('CREATE TABLE foo (bar TEXT)')
			) .set('say', 'cheese');
		}) .run(function(u, s) {
			assert.equal(s.foo, 'bar');
			assert.equal(s.say, 'cheese');
		}, err, state);

	}
};
