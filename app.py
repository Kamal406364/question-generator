import os
import fitz  
import re
import torch
import random
import time
from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fuzzywuzzy import fuzz 
from transformers import T5Tokenizer, T5ForConditionalGeneration
from together import Together
from dotenv import load_dotenv  
import difflib
from fastapi.middleware.cors import CORSMiddleware


load_dotenv()

client = Together()   

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

model_path = "C:/Users/kamal/OneDrive/Desktop/PROJ/question-generator/Question_Generator/t5_qgen_model"  # Path of the model
tokenizer = T5Tokenizer.from_pretrained(model_path)
model = T5ForConditionalGeneration.from_pretrained(model_path)

generated_questions = {}

# Function to generate questions from text using T5 model
def generate_questions(text, model, tokenizer, num_questions=3, max_length=50):
    questions = set()  
    input_text = f"generate question: {text}"
    input_ids = tokenizer.encode(input_text, return_tensors="pt", truncation=True, max_length=512)

    while len(questions) < num_questions:
        with torch.no_grad():
            output_ids = model.generate(
                input_ids,
                max_length=max_length,
                num_return_sequences=num_questions,
                do_sample=True,
                num_beams=5,
                top_k=50,
                top_p=0.9,
                temperature=1.2,
                repetition_penalty=1.3,
                early_stopping=True
            )

        for output in output_ids:
            question = tokenizer.decode(output, skip_special_tokens=True).strip()
            if question and not is_similar(question, questions):
                questions.add(question)

        if len(questions) >= num_questions:
            break 

    return list(questions)

# Function to refine questions using Together API
def refine_questions(topic_questions):
    refined_questions = []
    
    for question in topic_questions:
        try:
            response = client.chat.completions.create(
                model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
                messages=[{"role": "user", "content": f"Rephrase the following question to be clear, concise, and answerable within 16 marks: {question}"}]
            )

            if response and hasattr(response, "choices") and response.choices:
                refined_question = response.choices[0].message.content.strip()
            else:
                refined_question = question 

            refined_questions.append(refined_question)
            time.sleep(1)  

        except Exception as e:
            print(f"Error refining question: {question} - {str(e)}")
            refined_questions.append(question) 

    return refined_questions

import re

def clean_refined_questions(questions: list[str]) -> list[str]:
    cleaned = []
    for q in questions:
        q = re.sub(r"(?i)here'?s a rephrased version of the question[:\s]*", "", q)
        q = re.sub(r"\s*\(\s*\d+\s*(–|-)?\s*\d*\s*marks?\s*\)", "", q)
        q = q.strip()
        if q and q not in cleaned:
            cleaned.append(q)

    return cleaned

#Handle PDF Upload and Question Processing
@app.post("/upload/")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF, extract topics, generate and refine questions, and store them globally.
    """
    file_path = f"./{file.filename}"

    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())

        await file.close()  

        topics = extract_topics_from_pdf(file_path)

        global generated_questions
        generated_questions = {}

        for topic, content in topics.items():
            raw_questions = generate_questions(content, model, tokenizer, num_questions=5)
            refined_questions = refine_questions(raw_questions)
            refined_questions = clean_refined_questions(refined_questions)  


            generated_questions[topic] = {
                "refined": refined_questions
            }

    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Failed to delete file: {e}")

    return {
        "message": "Questions generated and refined successfully.",
        "questions": generated_questions
    }



#Retrieve Questions by Topic 
@app.get("/get_questions/")
async def get_questions(topics: str = Query(..., description="Comma-separated list of topics and counts in format: Topic:Count,Topic:Count")):
    """
    Fetch refined questions for requested topics.
    """
    response = {}

    try:
        topic_pairs = topics.split(",")
        topics_dict = {pair.rsplit(":", 1)[0].strip(): int(pair.rsplit(":", 1)[1].strip()) for pair in topic_pairs}

        for topic, num_questions in topics_dict.items():
            matched_topic = find_closest_match(topic, generated_questions.keys())

            if matched_topic:
                available_questions = generated_questions[matched_topic]["refined"]
                response[topic] = random.sample(available_questions, min(num_questions, len(available_questions)))
            else:
                response[topic] = {"error": "Topic not found."}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid format. Error: {str(e)}")

    return response


# Helper Functions to extract topics
def extract_topics_from_pdf(pdf_path):
    text = ""
    with fitz.open(pdf_path) as doc:
        for page in doc:
            text += page.get_text()
            
    topic_pattern = re.compile(r"(\d+\.\s*[A-Za-z ]+):")
    matches = topic_pattern.finditer(text)

    topic_dict = {}
    topic_positions = [(match.start(), match.group()) for match in matches]

    for i in range(len(topic_positions)):
        start_pos = topic_positions[i][0]
        topic_title = sanitize_topic(topic_positions[i][1])
        end_pos = topic_positions[i + 1][0] if i + 1 < len(topic_positions) else len(text)
        topic_content = text[start_pos:end_pos].replace(topic_title, "").strip()
        topic_dict[topic_title] = topic_content

    return topic_dict


# Sanitize topic names by removing leading numbers, dots, and colons
def sanitize_topic(topic):
    """ Remove leading numbers, dots, and colons from topic names. """
    cleaned_topic = re.sub(r"^\d+\.\s*", "", topic)
    cleaned_topic = cleaned_topic.rstrip(":")
    return cleaned_topic.strip()

# Check if a new question is similar to existing ones using fuzzy matching
def is_similar(new_question, existing_questions, threshold=75):
    for q in existing_questions:
        if fuzz.ratio(new_question.lower(), q.lower()) > threshold:
            return True
    return False

# Find the closest matching topic name using difflib
def find_closest_match(topic, available_topics):
    """Find the closest matching topic name"""
    matches = difflib.get_close_matches(topic, available_topics, n=1, cutoff=0.7)
    return matches[0] if matches else None


