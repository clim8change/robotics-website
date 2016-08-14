'use strict'

console.log()
console.log()
console.log('--- PROCESS INITIALIZED ---')
console.log('Time:', Date.now())

global.__base = __dirname + '/'
console.log("__base:", __base)

const express = require('express'),
  ejs = require('ejs'),
  app = express(),
  bodyParser = require('body-parser'),
  mongoose = require('mongoose'),
  moment = require('moment'),
  port = 80,

  logsRouter = require('./routers/logs'),
  memberRouter = require('./routers/member'),

  config = require('./config.json')

function getTimeFormatted() {
  return moment().format('MMMM Do YYYY, h:mm:ss a') + ' (' + Date.now() + ')'
}

console.log('Constants made at:', getTimeFormatted())

mongoose.connect('mongodb://127.0.0.1/test', (err) => {
  console.log('Database live on port', port, 'at', getTimeFormatted())
})

app.set('view engine', 'ejs')
app.set('views', __dirname + '/views')
app.set('env', 'development')
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static('static'))

// letsencrypt-express
var LEX = require('letsencrypt-express').testing();

var DOMAIN = config['domain'];
var EMAIL = config['email'];

var lex = LEX.create({
  configDir: require('os').homedir() + '/letsencrypt/etc'
, approveRegistration: function (hostname, approve) { // leave `null` to disable automatic registration
    if (hostname === DOMAIN) { // Or check a database or list of allowed domains
      approve(null, {
        domains: [DOMAIN]
      , email: EMAIL
      , agreeTos: true
      });
    }
  }
});

app.use('/logs', logsRouter)
app.use('/member', memberRouter)

app.use(function logRequest(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  console.log()
  console.log('--- NEW REQUEST ---')
  console.log('Time:', moment().format('MMMM Do YYYY, h:mm:ss a'), '(' + Date.now() + ')')
  console.log('IP: ', ip)
  console.log('Request:', req.originalUrl)
  next()
})

app.get('/hackathon', function (req, res) {
  res.render('pages/hackathon')
})

app.get('/about', function (req, res) {
  res.render('pages/about')
})

app.get('/photos', function (req, res) {
  res.render('pages/photos')
})

app.get('/', function (req, res) {
  res.render('pages/index')
})

app.get('*', function (req, res, next) {
  res.status(404)
  res.errCode = 404
  next('URL ' + req.originalUrl + ' Not Found')
})

app.use(logErrors)
app.use(clientErrorHandler)
app.use(errorHandler)

function logErrors(err, req, res, next) {
  console.error(err.stack)
  next(err)
}

function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.status(500).render('pages/error', { statusCode: 500, error: 'Something failed!' })
  } else {
    next(err)
  }
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  res.status(res.errCode || err.status || 500)
  res.render('pages/error', { statusCode: res.errCode || err.status || 500, error: err })
}

app.use(function (req, res) {
  res.send({ success: true });
});

lex.onRequest = app;

lex.listen([80], [443, 5001], function () {
  var protocol = ('requestCert' in this) ? 'https': 'http';
  console.log("Listening at " + protocol + '://localhost:' + this.address().port);
});
