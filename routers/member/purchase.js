'use strict'

const express = require('express'),
  router = express.Router(),
  moment = require('moment'),
  compression = require('compression'),
  https = require('https'),
  session = require('express-session'),
  cookieParser = require('cookie-parser'),
  config = require(__base + 'config.json'),
  Purchase = require('../../models/purchase'),
  User = require('../../models/user'),
  nodemailer = require('nodemailer'),
  xss = require('xss'),
  smtpConfig = config["automail"],
  transporter = nodemailer.createTransport(smtpConfig),
  csrf = require('csurf'),
  csrfProtection = csrf({ cookie: true }),
  ranks = require('../../helpers/ranks.json')

router.use(cookieParser())

const safeString = (str) => {
  return (typeof str === 'undefined' ? "" : str)
}

const toNumber = (num, err) => {
  var res = parseInt(num, 10)
  return isNaN(res) ? err.toString() : res
}

const mapToNumber = (arr, err) => {
  return Array.isArray(arr) ? arr.map((x) => {
    return toNumber(x, err)
  }) : toNumber(arr, err)
}

const toDollarAmount = (num, err) => {
  var res = parseFloat(num, 10).toFixed(2)
  return res==="NaN" ? err.toString() : res
}

const mapToDollarAmount = (arr, err) => {
  return Array.isArray(arr) ? arr.map((x) => {
    return toDollarAmount(x, err)
  }) : toDollarAmount(arr, err)
}

const deleteBlanks = (arr) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (typeof arr[i] === 'undefined' || arr[i] === null || arr[i] === '') arr.splice(i, 1)
  }
}

// must be pr_whitelisted to see below pages
router.all('/*', function (req, res, next) {
  if (req.auth.level >= ranks.pr_whitelist) {
    next()
  } else {
    res.render('pages/member/error', { statusCode: 401, error: "Must be whitelisted to use the Purchase Request system."})
  }
})

/*router.get('/wiki', function (req, res) {
  res.render('pages/member/wiki')
})*/

router.get('/', function (req, res) {
  res.redirect('list_my')
})

router.get('/view/:purchase_id', function (req, res) {
  Purchase.findOne({ purchase_id: req.params.purchase_id }, (err, purchase) => {
    if (err || purchase==null) res.render('pages/member/error', { statusCode: 404, error: ( err ? err : "Purchase not found" ) })
    else res.render('pages/member/purchase/view', { purchase: purchase, creation: purchase._id.getTimestamp().toDateString(), total: purchase.totalCost() })
  })
})

router.get('/list_object/:filter', function (req, res) {
  let query = {}
  if (req.params.filter === 'my') {
    query = { submitted_by: req.auth.info.email }
  }
  else if (req.params.filter === 'admin') {
    query = { $or: [{approval: 0}, {approval: 3}] }
  }
  else if (req.params.filter === 'mentor') {
    query = { approval: 2 }
  }

  Purchase.find(query).sort({ purchase_id: -1 })
  .then(purchases => {
    let map = []
    purchases.forEach((e, i) => {
      map[i] = JSON.parse(JSON.stringify(e))
      map[i].total_cost = e.totalCost()
    })
    res.send(map)
  })
  .catch(err => {
    res.status(500).json({ success: false, error: { message: err } })
    return
  })
})

router.get('/list_object/', function (req, res) {
  Purchase.find({}).sort({ purchase_id: -1 })
  .then(purchases => {
    let map = []
    purchases.forEach((e, i) => {
      map[i] = JSON.parse(JSON.stringify(e))
      map[i].total_cost = e.totalCost()
    })
    res.send(map)
  })
  .catch(err => {
    res.status(500).json({ success: false, error: { message: err } })
    return
  })
})

router.get('/list/', function (req, res) {
  res.render('pages/member/purchase/list', { filter: 'all' })
})

router.get('/list_my', function (req, res) {
  res.render('pages/member/purchase/list', { filter: 'my' })
})

router.get('/create', csrfProtection, function (req, res) {
  res.render('pages/member/purchase/create', { csrfToken: req.csrfToken() })
})

const xss_array = function(arr) {
  let res = arr
  if (typeof arr === 'string') {
    res = [res]
  }
  for (let i = 0; i < res.length; i++) {
    res[i] = xss(res[i])
  }
  return res
}

router.post('/create', csrfProtection, function (req, res) {
  if (req.body.part_url === ""&&
      req.body.part_number === ""&&
      req.body.part_name === ""&&
      req.body.subsystem === ""&&
      req.body.price_per_unit === ""&&
      req.body.quantity === "") {
    req.body.part_url =
      req.body.part_number =
      req.body.part_name =
      req.body.subsystem =
      req.body.quantity = []
  }
  if (req.body.part_url[0] === ""&&
          req.body.part_number[0] === ""&&
          req.body.part_name[0] === ""&&
          req.body.subsystem[0] === ""&&
          req.body.part_url[0] === ""&&
          !req.body.price_per_unit[0]&&
          !req.body.quantity[0]) {
    req.body.part_url.shift()
    req.body.part_number.shift()
    req.body.part_name.shift()
    req.body.subsystem.shift()
    req.body.price_per_unit.shift()
    req.body.quantity.shift()
  }
  Purchase.create({
    subteam: xss(safeString(req.body.subteam)),
    vendor: xss(safeString(req.body.vendor)),
    vendor_phone: xss(safeString(req.body.vendor_phone)),
    vendor_email: xss(safeString(req.body.vendor_email)),
    vendor_address: xss(safeString(req.body.vendor_address)),
    reason_for_purchase: xss(safeString(req.body.reason_for_purchase)),
    part_url: xss_array(req.body.part_url),
    part_number: xss_array(req.body.part_number),
    part_name: xss_array(req.body.part_name),
    subsystem: xss_array(req.body.subsystem),
    price_per_unit: xss_array(mapToDollarAmount(req.body.price_per_unit, 0)),
    quantity: xss_array(mapToNumber(req.body.quantity, 0)),
    shipping_and_handling: xss_array(toDollarAmount(req.body.shipping_and_handling, 0)),
    tax: xss(toDollarAmount(req.body.tax, 0)),
    submitted_by: safeString(req.auth.info.email),
  }, (err, purchase) => {
    if (err) {
      console.error(err)
      res.render('pages/member/error', { statusCode: 500, error: err })
      return
    }
    transporter.sendMail({
      from: 'HarkerRobotics1072 Purchase System', // sender address
      to: 'harker1072@gmail.com', // list of receivers
      subject: 'Purchase Request has been created!', // Subject line
      text: 'Purchase Request can be found here: http://robotics.harker.org/member/purchase/view/' + purchase.purchase_id, // plaintext body
    }, (err) => {
      res.redirect('view/' + purchase.purchase_id)
      if (err) console.error(err)
      else console.log("Email sent!")
    })
  });
})

router.get('/edit/:purchase_id', function (req, res) {
  Purchase.findOne({ purchase_id: req.params.purchase_id }, (err, purchase) => {
    if (err || purchase==null) res.render('pages/member/error', { statusCode: 404, error: ( err ? err : "Purchase not found" ) })
    else if (purchase.submitted_by.toLowerCase() === req.auth.info.email.toLowerCase() && purchase.approval <= 1) res.render('pages/member/purchase/edit', { purchase: purchase })
    else res.render('pages/member/purchase/view', { purchase: purchase })
  })
})

router.post('/edit/:purchase_id', function (req, res) {
  if (req.body.part_url === ""&&
      req.body.part_number === ""&&
      req.body.part_name === ""&&
      req.body.subsystem === ""&&
      req.body.part_url === ""&&
      !req.body.price_per_unit&&
      !req.body.quantity) {
    req.body.part_url =
      req.body.part_number =
      req.body.part_name =
      req.body.subsystem =
      req.body.price_per_unit =
      req.body.quantity = []
  }
  else if (req.body.part_url[0] === ""&&
          req.body.part_number[0] === ""&&
          req.body.part_name[0] === ""&&
          req.body.subsystem[0] === ""&&
          req.body.part_url[0] === ""&&
          !req.body.price_per_unit[0]&&
          !req.body.quantity[0]) {
    req.body.part_url.shift()
    req.body.part_number.shift()
    req.body.part_name.shift()
    req.body.subsystem.shift()
    req.body.price_per_unit.shift()
    req.body.quantity.shift()
  }

  Purchase.findOneAndUpdate({ purchase_id: req.params.purchase_id }, {
    subteam: xss(safeString(req.body.subteam)),
    vendor: xss(safeString(req.body.vendor)),
    vendor_phone: xss(safeString(req.body.vendor_phone)),
    vendor_email: xss(safeString(req.body.vendor_email)),
    vendor_address: xss(safeString(req.body.vendor_address)),
    reason_for_purchase: xss(safeString(req.body.reason_for_purchase)),
    part_url: xss_array(req.body.part_url),
    part_number: xss_array(req.body.part_number),
    part_name: xss_array(req.body.part_name),
    subsystem: xss_array(req.body.subsystem),
    price_per_unit: xss_array(mapToDollarAmount(req.body.price_per_unit, 0)),
    quantity: xss_array(mapToNumber(req.body.quantity, 0)),
    shipping_and_handling: xss_array(toDollarAmount(req.body.shipping_and_handling, 0)),
    tax: xss(toDollarAmount(req.body.tax,0)),
    submitted_by: safeString(req.auth.info.email),
    approval: 0,
  }, (err, purchase) => {
    if (err) {
      console.error(err)
      res.render('pages/member/error', { statusCode: 500, error: err })
      return
    }
    transporter.sendMail({
      from: 'HarkerRobotics1072 Purchase System', // sender address
      to: 'harker1072@gmail.com', // list of receivers
      subject: 'Purchase Request has been edited!', // Subject line
      text: 'Purchase Request can be found here: https://robodev.harker.org/member/purchase/view/' + req.params.purchase_id, // plaintext body
    }, (err) => {
      if (err) console.error(err)
      else console.log("Email sent!")
      res.redirect('../../view/' + purchase.purchase_id)
    })
  })
})


// must be an admin to see below pages
router.all('/*', function (req, res, next) {
  if (req.auth.level >= ranks.admin) {
    next()
  } else {
    res.render('pages/member/error', { statusCode: 401, error: "You must have higher clearance to reach this page."})
  }
})

router.get('/admin', function (req, res) {
  res.render('pages/member/purchase/list', { filter: 'admin' })
})

router.post('/admin/approve/:id', function (req, res) {
  let query = {}
  // if mentor
  if (req.auth.level == ranks.mentor || (req.auth.level >= ranks.superadmin && req.body.mentor === 'true')) {
    query.approval = 4
    query.mentor_comments = safeString(req.body.comments)
    query.mentor_username = safeString(req.auth.info.email)
    query.mentor_date_approved = new Date()
  }
  // if admin
  else {
    query.approval = 2
    query.admin_comments = safeString(req.body.comments)
    query.admin_username = safeString(req.auth.info.email)
    query.admin_date_approved = new Date()
  }
  Purchase.findOneAndUpdate({ purchase_id: req.params.id } , query, function(err, purchase) {
    if (err){
      res.status(500).json({ success: 'false', error: { message: err }})
      return
    }
    if (purchase==null) {
      res.status(404).json({ success: 'false', error: { message: 'Purchase not found' }})
      return
    }
    res.status(200).send()
  })
})

router.post('/admin/reject/:id', function (req, res) {
  let query = {}
  // if mentor
  if (req.auth.level == ranks.admin || (req.auth.level >= ranks.superadmin && req.body.mentor === 'true')) {
    query.approval = 3
    query.mentor_comments = safeString(req.body.comments)
    query.mentor_username = safeString(req.auth.info.email)
    query.mentor_date_approved = new Date()
  }
  // if admin
  else {
    query.approval = 1
    query.admin_comments = safeString(req.body.comments)
    query.admin_username = safeString(req.auth.info.email)
    query.admin_date_approved = new Date()
  }
  Purchase.findOneAndUpdate({ purchase_id: req.params.id }, query, function(err, purchase) {
    if (err){
      res.status(500).json({ success: 'false', error: { message: err }})
      return
    }
    if (purchase==null) {
      res.status(404).json({ success: 'false', error: { message: 'Purchase not found' }})
      return
    }
    res.status(200).send()
  })
})

/*router.get('/photos', function (req, res) {
  res.render('pages/member/photos')
})*/

// must be an mentor to see below pages
router.all('/*', function (req, res, next) {
  if (req.auth.level >= ranks.mentor) {
    next()
  } else {
    res.render('pages/member/error', { statusCode: 401, error: "You must have higher clearance to reach this page."})
  }
})

router.get('/mentor', function (req, res) {
  res.render('pages/member/purchase/list', { filter: 'mentor' })
})

module.exports = router