var gl;
var program;
var startTime;

var splines = [];
var points;
var colors;
var controlPoints;
var controlColors;
var theta = 0;
var alpha = 0;

var vBuffer;
var cBuffer;

var modelMatrix;
var modelMatrixLoc;

var currentSplineIndex;


function main() 
{
	// Retrieve <canvas> element
	var canvas = document.getElementById('webgl');

	// Get the rendering context for WebGL
	gl = WebGLUtils.setupWebGL(canvas);
	if (!gl) 
	{
		console.log('Failed to get the rendering context for WebGL');
		return;
	}
	
	gl.enable(gl.DEPTH_TEST);

	// Initialize shaders
	program = initShaders(gl, "vshader", "fshader");
	gl.useProgram(program);

	//Set up the viewport
	gl.viewport( 0, 0, canvas.width, canvas.height );

	points = [];
	colors = [];
	controlPoints = [];
	controlColors = [];

	colorCube();

	//gl.clearColor(0.2, 0.3, 0.5, 0.4);

	//gl.clear(gl.COLOR_BUFFER_BIT);

	vBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);

	var vPosition = gl.getAttribLocation(program, "vPosition");
	gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vPosition);

	var offsetLoc = gl.getUniformLocation(program, "vPointSize");
	gl.uniform1f(offsetLoc, 10.0);

	cBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);

	var vColor = gl.getAttribLocation(program, "vColor");
	gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vColor);

	var thisProj = perspective(120, 1, 0.1, 20);
	var projMatrix = gl.getUniformLocation(program, 'projMatrix');
	gl.uniformMatrix4fv(projMatrix, false, flatten(thisProj)); 

	var cameraMatrix = lookAt(vec3(6, 6, 7), vec3(6, 6, 0), vec3(0, 1, 0)); //maybe dont need these 3 lines
	var cameraLoc = gl.getUniformLocation(program, 'cameraMatrix');
	gl.uniformMatrix4fv(cameraLoc, false, flatten(cameraMatrix));

	modelMatrix = mat4();
	modelMatrixLoc = gl.getUniformLocation(program, "modelMatrix");
	gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(modelMatrix));

	gl.clearColor(0.0, 0.0, 0.0, 1.0);
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.drawArrays(gl.TRIANGLES, 0, points.length); //draw initial cube

	//render();

}

class Spline {
	constructor(name) {
		this.name = name;
		this.controlPoints = [];
		this.duration = 0;
	}
}

function catmullM() { //generate the catmull rom matrix
	let m = mat4(
		vec4(-1, 3, -3, 1),
		vec4(2, -5, 4, -1),
		vec4(-1, 0, 1, 0),
		vec4(0, 2, 0, 0)
	);
	return m;
}

function bSplineM() { //bspline matrix
	let m = mat4(
		vec4(-1, 3, -3, 1),
		vec4(3, -6, 3, 0),
		vec4(-3, 0, 3, 0),
		vec4(1, 4, 1, 0)
	);
	return m;
}

function slerp(q1, q2, t) {
	let cosTheta = dot(q1, q2);
	let theta = Math.acos(cosTheta);

	if (cosTheta < 0) {
		q2 = q2.map(number => -number);
		theta = -theta;
	}
	
 
	let a = Math.sin((1 - t) * theta) / Math.sin(theta);
	let b = Math.sin(t * theta) / Math.sin(theta);

	return q1.map((number, i) => number * a + q2[i] * b);;
}

function toQuat(x, y, z) {

	x = x * Math.PI / 180;
	y = y * Math.PI / 180;
	z = z * Math.PI / 180;

	let cr = Math.cos(x * 0.5);
	let sr = Math.sin(x * 0.5);
	let cp = Math.cos(y * 0.5);
	let sp = Math.sin(y * 0.5);
	let cy = Math.cos(z * 0.5);
	let sy = Math.sin(z * 0.5);

	let xF = sr * cp * cy - cr * sp * sy;
	let yF = cr * sp * cy + sr * cp * sy;
	let zF = cr * cp * sy - sr * sp * cy;
	let wF = cr * cp * cy + sr * sp * sy;


	return vec4(xF, yF, zF, wF);
}

function renderMovingCube(elapsed) {

	let curSpline = splines[currentSplineIndex];
	splinePoints = curSpline.controlPoints;

	points = [];
	colors = [];
	colorCube();

	let rotateMatrix = mat4();

	let splineDuration = curSpline.duration;
	let totalTime = Math.min(elapsed, splineDuration * 2); 

	if (totalTime >= splineDuration && catBFlag == 0) {
		catBFlag = 1;
		startTime = performance.now();
		totalTime = 0;
	}

	if (totalTime >= splineDuration && catBFlag === 1) {
        catBFlag = 0; 
        startTime = performance.now(); 
		currentSplineIndex++;
        
        if (currentSplineIndex >= splines.length) {
			console.log("End of spline! good job!");
            return;
        }
        return;
    }

	let animationTime = Math.min(totalTime, splineDuration); //tracks time of catmull or bspline but not total

	let numSegments = splinePoints.length - 1;
	let timePerSegment = splineDuration / numSegments;
	let segmentIndex = Math.min(Math.floor(animationTime / timePerSegment), numSegments - 1);

	let segmentStartTime = segmentIndex * timePerSegment;
	let segT = (animationTime - segmentStartTime) / timePerSegment;
	let x = 0;
	let y = 0;
	let z = 0;

	if (catBFlag == 0) {
		let p0 = 1; 
		let p1 = splinePoints[segmentIndex].position; 
		let p1A = splinePoints[segmentIndex];
		let p2 = 1; 
		let p2A = 1;
		let p3 = 1;

		if (segmentIndex == 0) {
			p0 = splinePoints[segmentIndex].position;
		} else {
			p0 = splinePoints[segmentIndex - 1].position;
		}
		
		if ((segmentIndex + 1) >= splinePoints.length) {//if i + 1 is out of bounds
			p2 = splinePoints[segmentIndex].position;
			p2A = splinePoints[segmentIndex];
		} else {
			p2 = splinePoints[segmentIndex + 1].position;
			p2A = splinePoints[segmentIndex + 1];
		}

		//if i + 2 is out of bounds, assign it to the last point in the array
		//if not then make it i + 2
		if ((segmentIndex + 2) >= splinePoints.length) {
			p3 = splinePoints[splinePoints.length - 1].position;
		} else {
			p3 = splinePoints[segmentIndex + 2].position;
		}


		let u = [Math.pow(segT, 3), Math.pow(segT, 2), segT, 1];
		let m = catmullM();
		let bX = vec4(p0[0], p1[0], p2[0], p3[0]);
		let bY = vec4(p0[1], p1[1], p2[1], p3[1]); 
		let bZ = vec4(p0[2], p1[2], p2[2], p3[2]); 

		x = 0.5 * dot(u, mult(m, bX));
		y = 0.5 * dot(u, mult(m, bY));
		z = 0.5 * dot(u, mult(m, bZ));

		let q1 = (toQuat(p1A.angles[0], p1A.angles[1], p1A.angles[2]));
		let q2 = normalize(toQuat(p2A.angles[0], p2A.angles[1], p2A.angles[2]));
		rotateMatrix = quatToMatrixM(slerp(q1, q2, segT));

		if (p1A.angles[0] == 0 && 
			p1A.angles[1] == 0 && 
			p1A.angles[2] == 0 && 
			p2A.angles[0] == 0 &&
			p2A.angles[1] == 0 &&
			p2A.angles[2] == 0) {
			rotateMatrix = mat4();
		}
		
	} else  if (catBFlag == 1) {
		let p0 = splinePoints[segmentIndex].position;
		let p1 = 1;
		let p2 = 1;
		let p3 = 1;
		
		if ((segmentIndex + 1) >= splinePoints.length) {//if i + 1 is out of bounds
			p1 = splinePoints[segmentIndex].position;
			p1A = splinePoints[segmentIndex];
		} else {
			p1 = splinePoints[segmentIndex + 1].position;
			p1A = splinePoints[segmentIndex + 1];
		}

		//if i + 2 is out of bounds, assign it to the last point in the array
		//if not then make it i + 2
		if ((segmentIndex + 2) >= splinePoints.length) {
			p2 = splinePoints[splinePoints.length - 1].position;
			p2A = splinePoints[splinePoints.length - 1];
		} else {
			p2 = splinePoints[segmentIndex + 2].position;
			p2A = splinePoints[segmentIndex + 2];
		}

		if ((segmentIndex + 3) >= splinePoints.length) {
			p3 = splinePoints[splinePoints.length - 1].position;
		} else {
			p3 = splinePoints[segmentIndex + 3].position;
		}
		
		
		let u = [Math.pow(segT, 3), Math.pow(segT, 2), segT, 1];
		let m = bSplineM();
		let bX = vec4(p0[0], p1[0], p2[0], p3[0]);
		let bY = vec4(p0[1], p1[1], p2[1], p3[1]); 
		let bZ = vec4(p0[2], p1[2], p2[2], p3[2]);

		x = dot(u, mult(m, bX)) / 6; //1/6 i think
		y = dot(u, mult(m, bY)) / 6;
		z = dot(u, mult(m, bZ)) / 6;

		let q1 = (toQuat(p1A.angles[0], p1A.angles[1], p1A.angles[2]));
		let q2 = normalize(toQuat(p2A.angles[0], p2A.angles[1], p2A.angles[2]));
		rotateMatrix = quatToMatrixM(slerp(q1, q2, segT));

		if (p1A.angles[0] == 0 && 
			p1A.angles[1] == 0 && 
			p1A.angles[2] == 0 && 
			p2A.angles[0] == 0 &&
			p2A.angles[1] == 0 &&
			p2A.angles[2] == 0) {
			rotateMatrix = mat4();
		}
	}
		
	gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
	
	let translateMatrix = translate(x, y, z);
	let ctMatrix = mult(translateMatrix, rotateMatrix);
	gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(ctMatrix));
	gl.drawArrays(gl.TRIANGLES, 0, points.length);
}

function renderData() {
	splinePoints = splines[currentSplineIndex].controlPoints;
	//console.log(splinePoints);

	for (let j = 0; j < splinePoints.length; j++) {
		let point = splinePoints[j].position;
		
		points = [];
		colors = [];
		
		colorCubeW();
		
		gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
		
		let translateMatrix = translate(point[0], point[1], point[2]);
		let scaleMatrix = scalem(0.5, 0.5, 0.5);
		let ctMatrix = mult(translateMatrix, scaleMatrix); //might have to switch the order
		gl.uniformMatrix4fv(modelMatrixLoc, false, flatten(ctMatrix));
		
		gl.drawArrays(gl.LINE_LOOP, 0, points.length);

	}
	
}

var id;
var catBFlag = 0;

function render() {

	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	const elapsed = (performance.now() - startTime) / 1000;

	if (currentSplineIndex >= splines.length) {
		return;
	}

	renderData();
	renderMovingCube(elapsed);

	gl.drawArrays(gl.TRIANGLES, 0, points.length);

	id = requestAnimationFrame(render);

}

const fileInput = document.getElementById("inputFile");

fileInput.addEventListener('change', (event) => {
	
	const selectedFile = event.target.files[0];
	if (selectedFile) {
		if (selectedFile.name.endsWith('.txt')) {
			const reader = new FileReader();
			reader.onload = function(e) {
				const text = e.target.result;
				splines = [];
				parseContent(text);

				if (splines.length > 0) {
					currentSplineIndex = 0;
					catBFlag = 0;
					startTime = performance.now();
					
					render();
				} else {
					console.log("no data to render!");
				}
			};
			reader.readAsText(selectedFile);
		} else {
			console.error("error, input file must be .txt");
		}

		
	}

});

var nSplines = 0;

function parseContent(text) {
	let currentSpline = null;
	let pointsLeft = 0;

	const lines = text.split('\n').filter(line => !line.trim().startsWith('#') && line.trim() !== '');
	//console.log(lines);

	for (let i = 0; i < lines.length; i++) { 
		const line = lines[i].trim(); 
		if (i == 0) { 
			nSplines = parseInt(line); 
			continue;
		}
		
		// starting on the second readable line/the first spline
		if (!currentSpline && splines.length < nSplines) {
			currentSpline = new Spline(`spline_${splines.length}`); //automate object creation/naming
			//the line we're currently on is thenumber of controlPoints
			pointsLeft = parseInt(line);
			i++; //go to duration line
			currentSpline.duration = parseFloat(lines[i].trim());
			continue; //this will go to the line with the first point coordinates
		}

		if (pointsLeft > 0) {
			const position = line.split(',').map(parseFloat);
			i++; //go to angles line
			const angles = lines[i].trim().split(',').map(parseFloat);
			currentSpline.controlPoints.push({position, angles}); //every control points will have position and angles
			pointsLeft--;
		}

		if (pointsLeft == 0) {
			splines.push(currentSpline);
			currentSpline = null; 
			//next line should be info for the next spline
			//so set currentSpline back to null 
			//so the next iteration goes back to if (!currentSpline)
			if (splines.length >= nSplines) {
				break;
			}
		}

	}

	//console.log(`parsed ${splines.length} splines`);
	//return splines; dont return anything just make splines global var and store it there
}

function colorCube() 
{
    quad( 1, 0, 3, 2 );
    quad( 2, 3, 7, 6 );
    quad( 3, 0, 4, 7 );
    quad( 6, 5, 1, 2 );
    quad( 4, 5, 6, 7 );
    quad( 5, 4, 0, 1 );
}

function quad(a, b, c, d)
{
    let vertices = [
        vec4( -0.5, -0.5,  0.5, 1.0 ),
        vec4( -0.5,  0.5,  0.5, 1.0 ),
        vec4(  0.5,  0.5,  0.5, 1.0 ),
        vec4(  0.5, -0.5,  0.5, 1.0 ),
        vec4( -0.5, -0.5, -0.5, 1.0 ),
        vec4( -0.5,  0.5, -0.5, 1.0 ),
        vec4(  0.5,  0.5, -0.5, 1.0 ),
        vec4(  0.5, -0.5, -0.5, 1.0 )
    ];

    let vertexColors = [
        [ 0.0, 0.0, 0.0, 1.0 ],  // black
        [ 1.0, 0.0, 0.0, 1.0 ],  // red
        [ 1.0, 1.0, 0.0, 1.0 ],  // yellow
        [ 0.0, 1.0, 0.0, 1.0 ],  // green
        [ 0.0, 0.0, 1.0, 1.0 ],  // blue
        [ 1.0, 0.0, 1.0, 1.0 ],  // magenta
        [ 0.0, 1.0, 1.0, 1.0 ],  // cyan
        [ 1.0, 1.0, 1.0, 1.0 ]   // white
    ];

    let indices = [ a, b, c, a, c, d ];

    for ( let i = 0; i < indices.length; ++i ) {
        points.push( vertices[indices[i]] );
        colors.push(vertexColors[i]); //a for solid colors
    }
}


//repeats of the colorCube functions but all the points are white (for control points)
function colorCubeW() 
{
    quadW( 1, 0, 3, 2 );
    quadW( 2, 3, 7, 6 );
    quadW( 3, 0, 4, 7 );
    quadW( 6, 5, 1, 2 );
    quadW( 4, 5, 6, 7 );
    quadW( 5, 4, 0, 1 );
}

function quadW(a, b, c, d)
{
    let vertices = [
        vec4( -0.5, -0.5,  0.5, 1.0 ),
        vec4( -0.5,  0.5,  0.5, 1.0 ),
        vec4(  0.5,  0.5,  0.5, 1.0 ),
        vec4(  0.5, -0.5,  0.5, 1.0 ),
        vec4( -0.5, -0.5, -0.5, 1.0 ),
        vec4( -0.5,  0.5, -0.5, 1.0 ),
        vec4(  0.5,  0.5, -0.5, 1.0 ),
        vec4(  0.5, -0.5, -0.5, 1.0 )
    ];

    let vertexColors = [
        [ 0.0, 0.0, 0.0, 1.0 ],  // black
        [ 1.0, 0.0, 0.0, 1.0 ],  // red
        [ 1.0, 1.0, 0.0, 1.0 ],  // yellow
        [ 0.0, 1.0, 0.0, 1.0 ],  // green
        [ 0.0, 0.0, 1.0, 1.0 ],  // blue
        [ 1.0, 0.0, 1.0, 1.0 ],  // magenta
        [ 0.0, 1.0, 1.0, 1.0 ],  // cyan
        [ 1.0, 1.0, 1.0, 1.0 ]   // white
    ];

    let indices = [ a, b, c, a, c, d ];

    for ( let i = 0; i < indices.length; ++i ) {
        points.push( vertices[indices[i]] );
        colors.push(vertexColors[7]); //a for solid colors
    }
}

// Converts a quaternion to an equivalent 4x4 matrix representation
function quatToMatrixM(q) {
    const [x, y, z, w] = q;
    return mat4( //made this mat4 because mult was having issues combining mat4 and float32array
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z),     2 * (x * z + w * y),     0,
        2 * (x * y + w * z),     1 - 2 * (x * x + z * z), 2 * (y * z - w * x),     0,
        2 * (x * z - w * y),     2 * (y * z + w * x),     1 - 2 * (x * x + y * y), 0,
        0,                       0,                       0,                       1
    );
}

// Converts a quaternion to an equivalent 4x4 matrix representation
function quatToMatrixF(q) {
    const [x, y, z, w] = q;
    return new Float32Array([
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z),     2 * (x * z + w * y),     0,
        2 * (x * y + w * z),     1 - 2 * (x * x + z * z), 2 * (y * z - w * x),     0,
        2 * (x * z - w * y),     2 * (y * z + w * x),     1 - 2 * (x * x + y * y), 0,
        0,                       0,                       0,                       1
    ]);
}