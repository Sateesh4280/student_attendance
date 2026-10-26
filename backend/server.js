//server.js
const { MongoClient, ObjectId } = require("mongodb");
const express = require("express");

const multer = require("multer")
const upload = multer()
const sanitizeHTML = require("sanitize-html")
const fse = require("fs-extra")
const sharp = require("sharp")

let db;

const path = require("path")
const React = require("react")
const ReactDOMServer = require("react-dom/server")
const StudentCard = require("../frontend/src/components/StudentCard").default

// when the app first launches, make sure the public/uploaded-photos folder exists
fse.ensureDirSync(path.join(__dirname, "../frontend/public", "uploaded-photos"))

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../frontend/views"));
app.use(express.static(path.join(__dirname, "../frontend/public")))

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.get("/", (req, res) => {
  res.render("index")
})

app.get("/studentdatabase", async (req, res) => {
  const allStudents = await db.collection("students").find().toArray()
  const generatedHTML = ReactDOMServer.renderToString(
    <div>
      <nav>
      <a href='/' className="logo">Student Attendance Management System</a>
      <ul>
          <li><a href='/home'>Home</a></li>
          <li><a href='/studentdatabase'>Student Database</a></li>
          <li><a href='/'>Take Attendance</a></li>
          <li><a href='/about'>README</a></li>
      </ul>
      </nav>
      <div className='container'>
        <h2>Student Database</h2>
        <br></br>
        {!allStudents.length && <p>There are no students yet, the admin needs to add a few.</p>}
        <div className="student-grid mb-3">
          {allStudents.map(student => (
            <StudentCard key={student._id} name={student.name} course={student.course} photo={student.photo} id={student._id} readOnly={true} />
          ))}
        </div>
        <p>
          <a href="/admin">Login / manage the student listings.</a>
        </p>
      </div>
    </div>
  )
  res.render("studentdatabase", { generatedHTML })
})

app.get("/about", (req, res) => {
  res.render("about")
})

app.get("/home", (req, res) => {
  res.render("home")
})

// Public API endpoints for attendance face recognition
app.get("/api/students", async (req, res) => {
  try {
    const allStudents = await db.collection("students").find().toArray()
    res.json(allStudents)
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch students" })
  }
})

app.get("/api/getStudentByName/:studentName", async (req, res) => {
  try {
    const decodedName = decodeURIComponent(req.params.studentName);
    const student = await db.collection("students").findOne({ name: decodedName });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch student" })
  }
})

function passwordProtected(req, res, next) {
  res.set("WWW-Authenticate", "Basic realm='Our MERN App'")
  if (req.headers.authorization == "Basic YWRtaW46YWRtaW4=") {
    next()
  } else {
    console.log(req.headers.authorization)
    res.status(401).send("Try again")
  }
}

app.use(passwordProtected)

app.get("/admin", (req, res) => {
  res.render("admin")
})

app.post("/create-student", upload.single("photo"), ourCleanup, async (req, res) => {
  if (req.file) {
    const photofilename = `${Date.now()}.jpg`
    await sharp(req.file.buffer).jpeg({ quality: 80 }).toFile(path.join(__dirname, "../frontend/public", "uploaded-photos", photofilename))
    req.cleanData.photo = photofilename
  }

  console.log(req.body)
  const info = await db.collection("students").insertOne(req.cleanData)
  const newStudent = await db.collection("students").findOne({ _id: new ObjectId(info.insertedId) })
  res.send(newStudent)
})

app.delete("/student/:id", async (req, res) => {
  if (typeof req.params.id != "string") req.params.id = ""
  const doc = await db.collection("students").findOne({ _id: new ObjectId(req.params.id) })
  if (doc && doc.photo) {
    fse.remove(path.join(__dirname, "../frontend/public", "uploaded-photos", doc.photo))
  }
  db.collection("students").deleteOne({ _id: new ObjectId(req.params.id) })
  res.send("Good job")
})

app.post("/update-student", upload.single("photo"), ourCleanup, async (req, res) => {
  if (req.file) {
    // if they are uploading a new photo
    const photofilename = `${Date.now()}.jpg`
    await sharp(req.file.buffer).jpeg({ quality: 80 }).toFile(path.join(__dirname, "../frontend/public", "uploaded-photos", photofilename))
    req.cleanData.photo = photofilename
    const info = await db.collection("students").findOneAndUpdate({ _id: new ObjectId(req.body._id) }, { $set: req.cleanData })
    if (info && info.value && info.value.photo) {
      fse.remove(path.join(__dirname, "../frontend/public", "uploaded-photos", info.value.photo))
    }
    res.send(photofilename)
  } else {
    // if they are not uploading a new photo
    db.collection("students").findOneAndUpdate({ _id: new ObjectId(req.body._id) }, { $set: req.cleanData })
    res.send(false)
  }
})

function ourCleanup(req, res, next) {
  if (typeof req.body.name != "string") req.body.name = ""
  if (typeof req.body.course != "string") req.body.course = ""
  if (typeof req.body._id != "string") req.body._id = ""

  req.cleanData = {
    name: sanitizeHTML(req.body.name.trim(), { allowedTags: [], allowedAttributes: {} }),
    course: sanitizeHTML(req.body.course.trim(), { allowedTags: [], allowedAttributes: {} })
  }

  next()
}

async function start() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student-attendance"
  const client = new MongoClient(uri)
  await client.connect()
  db = client.db()
  console.log("Connected to MongoDB successfully")

  // Auto-seed default students if database is empty
  const count = await db.collection("students").countDocuments()
  if (count === 0) {
    const defaultStudents = [
      { name: "Harry Potter", course: "Gryffindor", photo: "1703303413143.jpg" },
      { name: "Hermione Granger", course: "Gryffindor", photo: "1703314445266.jpg" },
      { name: "Ron Weasley", course: "Gryffindor", photo: "1703316048569.jpg" }
    ]
    await db.collection("students").insertMany(defaultStudents)
    console.log("Seeded sample students into database: Harry Potter, Hermione Granger, Ron Weasley")
  }

  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`)
  })
}
start()
