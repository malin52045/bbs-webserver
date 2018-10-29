
const express = require('express')
const path  = require('path')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const sqlite = require('sqlite')
const multer  = require('multer')
const nodemailer = require('nodemailer')
const svgCaptcha = require('svg-captcha')


const app = express()
const port = 3002

const upload = multer({dest: path.join(__dirname, './user-uploaded')})
const dbPromise = sqlite.open('./bbs.db', {Promise})

var db
var captchas = {}
// var transporter = nodemailer.createTransport({
//   service: 'smtp.163.com',
//   port:465,
//   secure:true,
//   auth: {
//     user: 'malin582045@163.com',
//     pass: 'wodemima0000'
//   }
// });

var smtpConfig = {
  host: 'smtp.163.com',
  port: 465,
  secure: true, // use SSL
  auth: {
      user: 'malin582045@163.com',
      pass: 'wodemima0000'
  }
};
var transporter = nodemailer.createTransport(smtpConfig);
//===================data

//=====================

app.set('views','./templates')
app.locals.pretty = true //浏览器源代码美观显示，加入换行空格(默认是去除)

app.use((req,res,next) => {
  // res.setHeader("Access-Control-Allow-Origin", "http://localhost:8080");

  //   res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")

  //  res.setHeader("Access-Control-Allow-Credentials", "true");

  next()
})

app.use('/static',express.static('./static'))
app.use('/avatar',express.static('./user-uploaded'))
app.use('/img',express.static('./img'))
app.use(bodyParser.urlencoded())
app.use(bodyParser.json())
app.use(cookieParser('qwertyu'))
app.use((req, res, next) => {
  console.log(req)
  if (!req.cookies.sessionId) {
    res.cookie('sessionId', Math.random().toString(16).substr(2))
  }
  next()
})
app.use(async (req,res,next) => {
  req.user = await db.get('SELECT id,name FROM users WHERE id=?',req.signedCookies.userId)
  next()
})



app.get('/isLogin',(req,res,next) => {
  if(req.signedCookies && req.signedCookies.userId){
    res.json(req.user)
  }else{
    res.status(401).json({
      code: -1,
      msg: 'unauthorized'
    })
  }
})


app.get('/api/posts',async (req,res,next) => {
  //let posts = await db.all('SELECT posts.*,users.name,users.avatar FROM posts JOIN users ON posts.userId=users.id')
  let posts = await db.all('SELECT temp.*,(SELECT COUNT(comments.postId) FROM comments WHERE comments.postId=temp.id) as count FROM (SELECT posts.*,users.name,users.avatar FROM posts JOIN users ON posts.userId=users.id) as temp')
  //let posts.map(it => await db.get('SELECT COUNT('))
  res.json(posts)
})

// SELECT comments.*,(SELECT COUNT(deepComments.commentId) FROM deepComments WHERE deepComments.commentId=comments.id) as count,name,avatar FROM comments JOIN users ON
//  comments.userId=users.id WHERE postId=1;

//  SELECT comments.*,(SELECT COUNT(deepComments.commentId) FROM deepComments WHERE deepComments.commentId=comments.id) as count FROM comments
//  SELECT * FROM (SELECT comments.*,(SELECT COUNT(deepComments.commentId) FROM deepComments WHERE deepComments.commentId=comments.id) as count FROM comments)

//用户信息及其发帖量 select users.*,(select count(comments.userId) from comments where comments.userId=users.id) as count from users;
app.get('/',async (req,res,next) => {
  let posts = await db.all('SELECT * FROM posts')
  console.log(posts)
  res.render('index.pug',{posts,user:req.user})
})



app.post('/api/register',upload.single('avatar'), async (req,res,next) => {
  console.log(req.body)
  let user = await db.get('SELECT * FROM users where name=?',req.body.name)
  if(user){
      res.status(403).json({
        code:-1,
        msg:'the user name already exists'
      })
    }else{
      db.run('INSERT INTO users (name,password,avatar,emailAddress) VALUES (?,?,?,?)',req.body.name,req.body.password,req.file ? req.file.filename : 'default',req.body.emailAddress)
      res.json('注册成功，请登录')     
    }
})

app.get('/api/user/:userId',async (req,res,next) => {
  let user = await db.get('SELECT name,avatar FROM users WHERE id=?',req.params.userId)
  let userPosts = await db.all('SELECT * FROM posts WHERE userId=?',req.params.userId)
  let userComments = await db.all('SELECT comments.*,posts.title FROM comments JOIN posts ON comments.postId=posts.id WHERE comments.userId=?',req.params.userId)
  res.json({user,userPosts,userComments})
})

app.get('/api/post/:postId',async (req,res,next) => {
  let post = await db.get('SELECT posts.*,name,avatar FROM posts JOIN users ON posts.userId=users.id WHERE posts.id=?',req.params.postId)
  //let postComments = await db.all('SELECT comments.*,name,avatar FROM comments JOIN users ON comments.userId=users.id WHERE postId=?',req.params.postId)
  let postComments = await db.all('SELECT temp.*,name,avatar FROM (SELECT comments.*,(SELECT COUNT(deepComments.commentId) FROM deepComments WHERE deepComments.commentId=comments.id) as count FROM comments) as temp JOIN users ON temp.userId=users.id WHERE postId=?',req.params.postId)
  res.json({post,postComments})
})


// SELECT temp.*,name,avatar FROM (SELECT comments.*,(SELECT COUNT(deepComments.commentId) FROM deepComments WHERE deepComments.commentId=comments.id) as count FROM co
// mments) as temp JOIN users ON temp.userId=users.id WHERE postId=2;

app.post('/api/addPost',async (req,res,next) => {
  await db.run('INSERT INTO posts (userId,title,content,timestamp) VALUES (?,?,?,?)',[req.body.userId,req.body.title,req.body.content,Date.now()])
  let post = await db.get('SELECT id FROM posts WHERE userId=? ORDER BY timestamp DESC LIMIT 1',req.body.userId)
  res.json(post.id)
})

app.post('/api/addComment',async (req,res,next) => {  
  await db.run('INSERT INTO comments (postId,userId,content,timestamp) VALUES (?,?,?,?)',[req.body.postId,req.body.userId,req.body.content,Date.now()]) 
  let comment = await db.get('SELECT comments.*,users.name,users.avatar FROM comments JOIN users ON comments.userId=users.id WHERE comments.userId=? ORDER BY comments.timestamp DESC LIMIT 1',req.body.userId)
  res.json(comment)
})

app.post('/api/addDeepComment',async (req,res,next) => {
  await db.run('INSERT INTO deepComments (commentId,userId,toUserName,content,timestamp) VALUES (?,?,?,?,?)',[req.body.commentId,req.body.userId,req.body.toUserName,req.body.content,Date.now()])
  let comment = await db.get('SELECT deepComments.*,users.name,users.avatar FROM deepComments JOIN users ON deepComments.userId=users.id WHERE deepComments.userId=? ORDER BY deepComments.timestamp DESC LIMIT 1',req.body.userId)
  res.json(comment)
})

app.get('/api/deepComments/:commentId',async (req,res,next) => {
  let deepComments = await db.all('SELECT deepComments.*,users.name,users.avatar FROM deepComments JOIN users ON users.id=deepComments.userId WHERE commentId=?',req.params.commentId)
  res.json(deepComments)
})

app.get('/api/comments/:postId',async (req,res,next) => {
  let postComments = await db.all('SELECT comments.*,users.name,users.avatar FROM comments JOIN users ON users.id=comments.userId WHERE postId=?',req.params.postId)
  res.json(postComments)
})

app.post('/api/login',async (req,res,next) => {
  let {name,password,captcha} = req.body
  if(captcha != captchas[req.cookies.sessionId]){
    console.log(captcha,captchas[req.cookies.sessionId])
    res.status(403).json({
      code:-1,
      msg:'the captcha is not correct'
    })
    return 
  }

  let user = await db.get('SELECT id,name FROM users WHERE name=? and password=?',name,password)
  
  if(user){
    res.cookie('userId',user.id,{
      signed:true
    })
    res.json(user)
  }else {
    res.status(403).json({
      code:-1,
      msg:'the user or password is not find'
    })
  }
})

app.post('/api/retrieval-password/',async (req,res,next) => {
  let user = await db.get('SELECT * FROM users WHERE name=? and emailAddress=?',req.body.username,req.body.emailAddress)
  if(!user){
    res.status(403).json({
      code:-1,
      msg:'your username and emailAddress do not match'
    })
    return 
  }
  console.log(req.body.emailAddress)
  let retrievalId = Math.random().toString(16).substr(2)
  var mailOptions = {
    from: 'malin582045@163.com',
    to: req.body.emailAddress,
    subject: 'Sending Email using Node.js',
    text: 'That was easy!'
    // html:`
    //   <a href="/api/retrieval-password-reset/"${retrievalId}>点击链接找回密码</a>
    // `
  }

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  })
  res.end('send')
})



//前后端分离 Vue+express+axios
//======
//后端 express+pug模板

app.route('/register')
  .get((req,res,next) => {
    res.render('register.pug',{user:req.user})
  })
  .post(upload.single('avatar'),async (req,res,next) => {
    let user = await db.get('SELECT * FROM users where name=?',req.body.name)
    if(user){
      res.end('the name has been used')
    }else{
      console.log(req.body)
      db.run('INSERT INTO users (name,password,avatar) VALUES (?,?,?)',req.body.name,req.body.password,req.file ? req.file.filename : 'default')
      res.redirect('/login')      
    }
  })

  
  


//==== 先不处理
app.route('/retrieval-password')
  .get((req,res,next) => {
    res.render('retrieval-password.pug')    
  })
  .post(async (req,res,next) => {
    // let user = await db.get('SELECT * FROM users WHERE user.id=? and email=?',req.body.username,req.body.emailAddress)
    // if(!user){
    //   res.status(403).json({
    //     code:-1,
    //     msg:'your username and emailAddress do not match'
    //   })
    //   return 
    // }
    console.log(111)
    let retrievalId = Math.random().toString(16).substr(2)
    var mailOptions = {
      from: 'malin582045@163.com',
      to: req.body.emailAddress,
      cc:'malin582045@163.com',
      subject: 'Reset password',
      text: 'That was easy!',
      html:`
        <p>找回密码</p>
        <a href="">点击链接找回密码</a>
      `
    }

    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    })
    res.end('send')
  })



app.route('/login')
  .get((req,res,next) => {
    res.render('./login.pug',{user:req.user})
  })
  .post(async (req,res,next) => {
    let {name,password,captcha} = req.body
    if(captcha != captchas[req.cookies.sessionId]){
      res.end('the captcha is not correct')
      return 
    }

    let user = await db.get('SELECT * FROM users WHERE name=? and password=?',name,password)
    
    if(user){
      res.cookie('userId',user.id,{
        signed:true
      })
      res.redirect('/')  
    }else {
      res.end('the user or password is not find')
    }
  })

app.get('/captcha/:id',(req,res,next) => {
  var captcha = svgCaptcha.create()
  captchas[req.cookies.sessionId] = captcha.text
  console.log(req)
  res.type('svg')
  res.send(captcha.data)
})

app.get('/logout',(res,req,next) => {
  req.clearCookie('userId')
  req.redirect('/')
})



app.get('/post/:postId',async (req,res,next) => {
  let post = await db.get('SELECT posts.*,users.name,users.avatar FROM posts JOIN users ON users.id=posts.userId WHERE posts.id=?',req.params.postId)
  let postComments = await db.all('SELECT comments.*,users.name,users.avatar FROM comments JOIN users ON users.id=comments.userId WHERE postId=?',req.params.postId)

  console.log('postComments',postComments)
  if(post) res.render('post.pug',{post,comments:postComments,user:req.user})
    else res.status(404).render('post-not-find.pug')
})


app.post('/addComment',(req,res,next) => {
  let userId = req.signedCookies.userId
  if(userId){
    db.run('INSERT INTO comments (userId,postId,content,timestamp) VALUES (?,?,?,?)',[userId,req.body.postId,req.body.comment,Date.now()])
    res.redirect('/post/' + req.body.postId)
  }else{
    res.end('you are not logged in,please login first')
  }
})


app.get('/user/:userId',async (req,res,next) => {
  let user = await db.get('SELECT * FROM users WHERE id=?',req.params.userId)
  console.log(user)
  if(user){
    let isSelf = false
    console.log(req.signedCookies.userId)
    if(req.signedCookies.userId == req.params.userId) isSelf = true
    let userPosts = await db.all('SELECT * FROM posts WHERE userId=?',req.params.userId)
    let userComments = await db.all('SELECT comments.*,posts.title FROM comments JOIN posts ON comments.postId=posts.id WHERE comments.userId=?',req.params.userId)
    if(userComments.length || userPosts.length) res.render('user.pug',{userPosts,userComments,name:user.name,user:req.user,isSelf})
      else res.status(404).end('user is not active')
  }else{
    res.end('user is not find')
  }
})


app.route('/add-post')
  .get((req,res,next) => {
    res.render('add-post.pug')
  })
  .post(async (req,res,next) => {
    let userId = req.signedCookies.userId
    if(userId){
      let {title,content} = req.body
      await db.run('INSERT INTO posts (userId,title,content,timestamp) VALUES (?,?,?,?)',[userId,title,content,Date.now()])
      let post = await db.get('SELECT * FROM posts ORDER BY id DESC')  
      res.redirect('/post/' + post.id)
    }else{
      res.end('you are not logged in,please login frist')
    }
  })


app.get('/delete-post/:postId',(req,res,next) => {
  db.run('DELETE FROM posts WHERE id=?',req.params.postId)
  res.redirect('/user/' + req.signedCookies.userId)
})


app.get('/delete-comment/:commentId',(req,res,next) => {
  db.run('DELETE FROM comments WHERE id=?',req.params.commentId)
  res.redirect('/user/' + req.signedCookies.userId)
})





;
(async function(){
  db = await dbPromise;
  app.listen(port,()=> {
    console.log('server listening to : ' + port)
  })  
}())
