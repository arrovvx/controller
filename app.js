var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');
var debug = require('debug')('main');

var settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
var dataaccess = require('./dataaccess/index')(settings);
var routes = null; //require('./routes/index')(settings, dataaccess);
//var arm = require('./routes/arm');

routes = require('./routes/index')(settings, dataaccess);

//load express framework
var app = express();
var router = express.Router();
	
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


//main page
router.get('/', routes.index);
router.post('/getSignalGroups', routes.getSignalGroups);

//graphing page
router.post('/graph', routes.graph);
router.post('/newGraph', routes.graphNew);
router.post('/getSignalGroupInfo', routes.getSignalGroupInfo);

//graphing utilities
router.post('/record', routes.record);
router.post('/playback', routes.playback);
router.post('/test', routes.testTLC);
router.post('/save', routes.save);
router.post('/clear', routes.clearTmpData);
router.post('/delete', routes.deleteSignalGroup);
router.post('/add', routes.addChannel);
router.post('/subtract', routes.subtractChannel);

//performance page
router.get('/diagnostic', routes.diagnostic);
router.post('/serviceStatus', routes.serviceStatus);
router.post('/initPerformanceTest', routes.initPerformanceTest);
router.post('/performanceTest', routes.performanceTest);


app.use('/', router);

process.on('SIGINT', function() {
	
	dataaccess.clearTmpData();	//make sure the database is not polluted when server exits
	//mongodb.close();
	process.exit(0);
});

/*
// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace

if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
	  message: err.message,
	  error: err
	});
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
	message: err.message,
	error: {}
  });
});
*/


module.exports = app;


