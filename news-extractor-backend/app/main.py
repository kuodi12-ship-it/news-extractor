from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import httpx
from bs4 import BeautifulSoup
from google import genai
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# In-memory storage for extracted news
news_store: list[dict] = []


class URLRequest(BaseModel):
    url: HttpUrl


class NewsItem(BaseModel):
    url: str
    title: str
    summary: str
    image_url: str | None = None
    tags: list[str] = []


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/api/extract", response_model=NewsItem)
async def extract_news(request: URLRequest):
    url_str = str(request.url)

    # Step 1: Fetch the HTML from the URL
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
        ) as http_client:
            response = await http_client.get(url_str)
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to fetch URL: HTTP {e.response.status_code}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to fetch URL: {str(e)}",
        )

    html_content = response.text

    # Step 2: Parse and clean the HTML to reduce token usage
    soup = BeautifulSoup(html_content, "html.parser")

    # Remove scripts, styles, and other non-content elements
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript"]):
        tag.decompose()

    # Extract text content and meta info
    meta_title = ""
    meta_description = ""
    og_image = ""

    title_tag = soup.find("title")
    if title_tag:
        meta_title = title_tag.get_text(strip=True)

    meta_desc_tag = soup.find("meta", attrs={"name": "description"})
    if meta_desc_tag:
        meta_description = str(meta_desc_tag.get("content", ""))

    og_image_tag = soup.find("meta", attrs={"property": "og:image"})
    if og_image_tag:
        og_image = str(og_image_tag.get("content", ""))

    # Get the main text content (limit to avoid huge payloads)
    body_text = soup.get_text(separator="\n", strip=True)
    # Limit to first 5000 characters to stay within token limits
    body_text = body_text[:5000]

    cleaned_content = f"""
Page Title: {meta_title}
Meta Description: {meta_description}
OG Image: {og_image}

Page Content:
{body_text}
"""

    # Step 3: Send to Gemini for structured extraction
    prompt = f"""You are a news article extractor. Given the content of a news page, extract structured data.
Return a JSON object with these fields:
- "title": The article title (string)
- "summary": A concise summary of the article in 2-3 sentences (string)
- "image_url": The main article image URL if found (string or null)
- "tags": An array of 3-5 relevant topic tags (array of strings)

Return ONLY valid JSON, no other text.

Extract news data from this page content:

{cleaned_content}"""

    try:
        ai_response = gemini_client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt,
        )

        result_text = ai_response.text
        if not result_text:
            raise HTTPException(status_code=500, detail="AI returned empty response")

        # Clean up the response (remove markdown code blocks if present)
        result_text = result_text.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("\n", 1)[1]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
            result_text = result_text.strip()

        extracted_data = json.loads(result_text)

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500, detail="Failed to parse AI response as JSON"
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500, detail=f"AI processing error: {str(e)}"
        )

    # Step 4: Build the news item
    news_item = NewsItem(
        url=url_str,
        title=extracted_data.get("title", meta_title or "Untitled"),
        summary=extracted_data.get("summary", meta_description or "No summary available"),
        image_url=extracted_data.get("image_url") or og_image or None,
        tags=extracted_data.get("tags", []),
    )

    # Store in memory
    news_store.append(news_item.model_dump())

    return news_item


@app.get("/api/news", response_model=list[NewsItem])
async def get_news():
    return news_store


@app.delete("/api/news")
async def clear_news():
    news_store.clear()
    return {"message": "All news cleared"}
