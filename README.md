NodAM stands for Node.js Asynchronous Monad. NodAM provides concise,
intuitive functions for control flow through asynchronous calls. You
can serialize and parallelize your IO calls, combine sequences, and
create modified sequences without any effect on the originals. If
you don't know what monads are, check the code samples below. An example
is worth a thousand words. Also, a terminology section will be added
in the near future.

```javascript
var nodam = require('nodam');

// load monadic IO libraries
var fs    = nodam.fs();
var http  = nodam.http();

// two simple aynchrous actions
// These functions have no side effects, ie, 
// no IO is happening yet.

var jake_web = http.get('http://example.com/jake.html', 'utf8');

var check_jake = fs.readFile('jake.data', 'utf8')
  .pipe(function(data) {
    var config = customParse(data);

    // get the url, and the content we expect to find there
    var url = config.url;
    var expected = canonicalizeHtml(config.page_content);

    return http.get(url)
      // mmap passes the monad's data through a function
      .mmap(canonicalizeHtml)

      // check against retrieved data and wrap the result in our monad
      .pipe(function(html) {
        return nodam.result(html == expected);
      });
  });

// Now, do the action
// The first callback is run at the end of the action
// the second if there is an IO error
check_jake.run(function(pages_match) {
  if (pages_match) {
    conosle.log('Hooray!');
  } else {
    console.error('Boooo!');
  }
}, function(err) {
  console.error(
    'Could not check the file, because the IO action failed: ' + error
  );
});
```

Here is a more involved example. A common naming convention when dealing
with monads is to end functions that _output_ a monad in a capital M,
unless they also have a monad _input_, in which case their title starts
with a small m. (Maybe for consistency NodAM will follow this convention
in the future!)

```javascript
var nodam = require('nodam');
var _ = nodam.underscore_plus;

// collections of monadic versions of node IO functions
var fsM    = nodam.fs();
var httpM  = nodam.http();

// a utility function that filters out undesirable text (or something)
function cleanPage(str) {
  return do_html_entities(xss_buster(str));
}

var mashup = nodam
  // get 2 pages at once
  .combine([ httpM.get(url1), httpM.get(url2) ])

  // mash them
  .pipeArray(function(page1, page2) {
    var mashup = formatPages(page1, page2);

    return nodam.result(mashup);
  })

  // set a callback to catch errors that occur before this point
  .onErr(function(err) {
    console.error('Could not fetch all pages: ' + err);
  })

  // if no errors, we continue
  .pipe(function(mashed_page) {
    if (notTooLong(mashed_page)) {
      // call a custom monadic function that grabs ads from
      // an online ad server and puts them in the page
      return addMoreAdsM(ads_server);
    } else {
      // return unaltered page
      return nodam.result(mashed_page);
    }
  });

// A monadic version of cleanPage
var mcleanPage = nodam.liftM(cleanPage);

// add a cleaning to our mashup action
var clean_mashup = mcleanPage(mashup);

// regular IO functions are valid, of course
var http = require('http');

http.createServer(function(request, response) {
  clean_mashup
    // log this page, and send it to the user at the same time
    .pipe(function(cleaned_page) {
      return nodam.combine([
        fsM.writeFile(mashup_log_path, cleaned_page),
        response.end(cleaned_page)
      ]);
    })
    
    // log any errors
    .onErr(logPageErrorsM)

		// then() - for when you don't care what you just did
		.then(
			fsM.open(hitTally, 'a', 'ascii') .pipe(function(handle) {
				return fsM.write(handle, '1');
			})
		)

    // Let's go!
    // Don't need to do anything on success,
    // and onErr is catching, the errors, so...
    .run();
});
```

NodAM is side-effect free, meaning that pipe(), run(), then(), and the rest
have no effect on the objects on which they are called. So,

```javascript
var read_jake = fsM.readFile('jake');

var yell_jake = read_jake
	// capitalize
	.mmap(_.method('toUpperCase'))

	// this error handler applies to yell_jake, but not to read_jake
	.onErr(function() {
		console.log('I lost my voice');
	})

	// monadic version of console.log
	.pipe(nodam.log);

var say_jake = read_jake
	// this error handler applies to say_jake only
	.onErr(function(err) {
		console.log('I tried to say "jake", but I failed');
	})
	.pipe(nodam.log);

yell_jake.run();
	// HEY JAKE!
say_jake.run();
	// Hey Jake!
```
