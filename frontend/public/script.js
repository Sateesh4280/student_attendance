var video = document.getElementById('videoCam');
var button = document.getElementById('startButton');
var viewLogButton = document.getElementById('viewLogButton');
var confirmButton = document.getElementById('confirmButton');
var closeLogButton = document.getElementById('closePopup');

document.getElementById('confirmButton').style.visibility='hidden';

//loads face recognition models
Promise.all([
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
]).then(start);

//starts user's webcam
function openCam(){
    // only play if "START" is pressed
    if (button.textContent == 'START'){
        // change words on start button
        button.textContent = 'STOP';
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.log('getUserMedia() not supported :(');
            return;
        } 
        navigator.mediaDevices.getUserMedia({video: true}) 
        .then(function(vidStream) {
            if ("srcObject" in video) { 
                video.srcObject = vidStream;
            } else { 
                video.src = window.URL.createObjectURL(vidStream); 
            }
            video.onloadedmetadata = function() { 
                video.play(); 
                document.getElementById('status').innerHTML='Identifying face...'; //change status
                paused = false; //make sure face recognition is unpaused, if the webcam was previously stopped
            } 
        }) 
        .catch(function(err0r) { 
            console.log(err0r.name + ': ' + err0r.message); 
        }); 
    }    else {
        // stop video if "STOP" is pressed
        button.textContent = 'START';
        video.srcObject.getTracks().forEach(function(track){
            if (track.readyState == 'live') {
                    track.stop();
            }
        });
        //creates custom event for video stopped for addEventListener in start()
        var event = new Event('videoStopped');
        video.dispatchEvent(event);
        document.getElementById('status').innerHTML='Video stopped'; //change status
        console.log('video stopped');
    }
}
button.addEventListener("click", openCam);


var studentRecognised;
var paused = false;

async function start() {
    console.log('successfully loaded models :)');
    const labeledFaceDescriptors = await loadStudentImages();
    if (!labeledFaceDescriptors || labeledFaceDescriptors.length === 0) {
        console.log('No valid face descriptors available yet.');
        return;
    }
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
    video.addEventListener('play', async () => {loop});
    var loop = setInterval(
        async function faceRecognition(){
            video.addEventListener('videoStopped', async () => {
                paused = true; // pauses the face recognition function until video starts again when "START" is pressed
                console.log('face recognition has stopped'); 
            });

            if (!paused) { //only run normally if not paused
                studentRecognised = null;
                //to detect face and retrieve face landmarks and descriptors
                const liveDetections = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor(); 
                console.log(liveDetections);
                if (liveDetections != null) { //if one face is detected, try to recognise face
                    const bestMatch = faceMatcher.findBestMatch(liveDetections.descriptor);
                    var studentRecognised = bestMatch.toString();
                    console.log(studentRecognised);
                    var studentName = studentRecognised.split(' '+'(')[0]; //obtain name of student recognised
                    if (studentName != 'unknown') { //if student name is registered and not unknown
                        document.getElementById('confirmButton').style.visibility='visible';
                        document.getElementById('status').innerHTML='Student found'; //change status
                        displayStudentRecognised(studentName);
                        paused = true; // pauses the face recognition function until "confirm attendance" is pressed
                    }                    
                } else {
                    console.log('no faces or multiple faces detected :( please try again.')
                }
            }
        }
    , 4000);    //repeats face recognition function every 4 seconds until a face is detected
}

//if 'confirm attendance' is pressed, resume face recognition, and restore everything to that stage
function confirmAttendance() {
    paused = false;
    document.getElementById('studentName').innerHTML='';
    document.getElementById('dateTime').innerHTML='';
    document.getElementById('confirmButton').style.visibility='hidden';
    document.getElementById('studentImg').style.visibility='hidden';
    if (button.textContent == 'STOP'){
        document.getElementById('status').innerHTML='Identifying face...';
    }
}
confirmButton.addEventListener("click", confirmAttendance);


//process student images for face recognition
async function loadStudentImages() {
    try {
        const response = await fetch(`/api/students`);
        const allStudents = await response.json();
        if (!allStudents || allStudents.length === 0) {
            document.getElementById('status').innerHTML = 'No students registered. Add students in Admin.';
            return [];
        }
        const labels = allStudents.map(student => student.name);
        const results = await Promise.all(
            labels.map(async label => {
                const descriptions = [];
                for (let i = 1; i <= 2; i++) {
                    try {
                        const response = await fetch(`/api/getStudentByName/${encodeURIComponent(label)}`);
                        const student = await response.json();
                        if (student && student.photo) {
                            const img = await faceapi.fetchImage(`/uploaded-photos/${student.photo}`);
                            const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                            if (detections && detections.descriptor) {
                                descriptions.push(detections.descriptor);
                            }
                        }
                    } catch (e) {
                        console.error('Error extracting descriptor for', label, e);
                    }
                }
                if (descriptions.length > 0) {
                    console.log('successfully loaded student image descriptors for:', label);
                    return new faceapi.LabeledFaceDescriptors(label, descriptions);
                }
                return null;
            })
        );
        const validDescriptors = results.filter(d => d !== null);
        if (validDescriptors.length > 0) {
            document.getElementById('status').innerHTML = 'Press START to begin';
        } else {
            document.getElementById('status').innerHTML = 'Could not detect faces in student photos.';
        }
        return validDescriptors;
    } catch (err) {
        console.error('Error in loadStudentImages:', err);
        document.getElementById('status').innerHTML = 'Error loading student models';
        return [];
    }
}

var attendanceTable = document.getElementById("attendanceTable").getElementsByTagName('tbody')[0];
//display name and photo of student recognised and date and time the attendance was taken
async function displayStudentRecognised(studentName){
    var today = new Date();
    var minutes = String(today.getMinutes()).padStart(2, '0');
    var dateTime = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2, '0')+'-'+String(today.getDate()).padStart(2, '0')+' '+today.getHours()+':'+minutes;
    try {
        const response = await fetch(`/api/getStudentByName/${encodeURIComponent(studentName)}`);
        const student = await response.json();
        document.getElementById('dateTime').innerHTML=dateTime;
        document.getElementById('studentName').innerHTML=studentName;
        if (student && student.photo) {
            document.getElementById('studentImg').style.visibility='visible';
            document.getElementById('studentImg').src=`/uploaded-photos/${student.photo}`;
        }
    } catch (e) {
        console.error('Error fetching student details:', e);
    }

    //adds an entry of student's name and date and time of attendance to the list of new entries into the attendance table
    var row = attendanceTable.insertRow(0);
    var namecell = row.insertCell(0);
    var timecell = row.insertCell(1);
    namecell.innerHTML = studentName;
    timecell.innerHTML = dateTime;
}

//to open and close the popup window when "View Attendance Log" is clicked
const popupWindow = document.getElementById("popupWindowOverlay");
function viewLog(){
    popupWindow.style.display = 'flex';
}

function closeLog(){
    popupWindow.style.display = 'none';
}

viewLogButton.addEventListener("click", viewLog);
closeLogButton.addEventListener("click", closeLog);
