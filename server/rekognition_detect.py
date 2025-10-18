import os
import base64
import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import boto3

# Load environment variables from .env
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rekognition_detect")

# Initialize Rekognition client using env variables
rekognition = boto3.client(
    "rekognition",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION,
)

app = FastAPI()

# Add CORS Middleware — allow calls from frontend on localhost or deployed domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",  # Local development
        "http://localhost:5173",  # Vite dev server
        "https://disastermanagementrekognition.onrender.com",  # Production frontend (CHANGE THIS)
        "https://dronex-copy.onrender.com",
        "https://dronex-alert-now.vercel.app",  
        "https://dronex-alert-now-git-main-venkats-projects-0c1df854.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.post("/api/rekognition/detect")
async def detect(request: Request):
    """
    Accepts image_base64 in POST body, returns detected labels from Rekognition.
    """
    try:
        body = await request.json()
        image_base64 = body.get("image_base64")
        if not image_base64:
            raise HTTPException(status_code=400, detail="Missing image_base64 in request.")

        # Remove data URI prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",")[1]
        image_bytes = base64.b64decode(image_base64)
        logger.info("Received image for detection, size: %d bytes", len(image_bytes))

        response = rekognition.detect_labels(
            Image={"Bytes": image_bytes},
            MaxLabels=10,
            MinConfidence=50
        )
        
        # --- Custom log for detected objects/persons ---
        labels = response.get("Labels", [])
        label_names = [l.get("Name") for l in labels]
        logger.info("Detected labels: %s", label_names)

        # Log if 'Person' is detected
        if "Person" in label_names:
            logger.warning("PERSON detected in image!")
        # Log for any object detected
        if label_names:
            logger.info("Objects detected: %s", ", ".join(label_names))

        return {"labels": labels}

    except Exception as e:
        logger.error("Detection error: %s", str(e))
        raise HTTPException(status_code=400, detail="Detection error.")
