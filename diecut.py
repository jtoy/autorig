import os
from google import genai
from processing import diecut

def main():
    client = genai.Client()
    
    imagePath = "tobyturtle.png"
    outputPath = "diecut.png"

    diecut(client, imagePath, outputPath)

if __name__ == "__main__":
    main()