"use client";

import type React from "react";
import { useState } from "react";
import { Upload, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";

export default function QuestionGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [topicQuestionCounts, setTopicQuestionCounts] = useState<Record<string, number>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<
    { id: string; topic: string; question: string }[]
  >([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setIsUploading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      try {
        const response = await fetch("http://localhost:8000/upload/", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        setIsUploading(false);
        setIsFileUploaded(true);
        setTopics(Object.keys(data.questions));

        const initialCounts = Object.fromEntries(
          Object.keys(data.questions).map((topic) => [topic, 5])
        );
        setTopicQuestionCounts(initialCounts);
      } catch (error) {
        console.error("Error uploading file:", error);
        setIsUploading(false);
      }
    }
  };

  const generateQuestions = async () => {
    if (topics.length === 0) return;
    setIsGenerating(true);

    try {
      const topicsQuery = encodeURIComponent(
        topics.map((topic) => `${topic}:${topicQuestionCounts[topic] || 5}`).join(",")
      );

      const response = await fetch(
        `http://localhost:8000/get_questions/?topics=${topicsQuery}`
      );
      const data: Record<string, string[]> = await response.json();

      const formatted = Object.entries(data).flatMap(([topic, questions]) =>
        questions.map((question, i) => ({
          id: `${topic}-${i}`,
          topic,
          question,
        }))
      );

      setGeneratedQuestions(formatted);
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadWordDocument = () => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: generatedQuestions.map(({ topic, question }) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: `${topic}: ${question}`,
                  bold: true,
                }),
              ],
            })
          ),
        },
      ],
    });

    Packer.toBlob(doc).then((blob) => {
      saveAs(blob, "Generated_Questions.docx");
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="p-6 shadow-md">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-3">Upload Educational Material</h2>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
              <Input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".pdf,.docx,.txt"
                onChange={handleFileUpload}
              />
              <Label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center cursor-pointer"
              >
                {isFileUploaded ? (
                  <div className="flex items-center space-x-2 text-green-600">
                    <Check className="h-6 w-6" />
                    <span>{file?.name}</span>
                  </div>
                ) : isUploading ? (
                  <div className="flex flex-col items-center space-y-1 text-blue-600">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span>Uploading...</span>
                    </div>
                    <span className="text-xs text-blue-500">
                      This may take 3–5 minutes. Please wait...
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-slate-400 mb-2" />
                    <span className="text-slate-600 mb-1">
                      Drag and drop your file here or click to browse
                    </span>
                    <span className="text-xs text-slate-500">
                      Supports PDF, DOCX, TXT
                    </span>
                  </>
                )}
              </Label>
            </div>
          </div>

          {isFileUploaded && topics.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">Select Number of Questions Per Topic</h2>
              <div className="space-y-4">
                {topics.map((topic) => (
                  <div
                    key={topic}
                    className="flex items-center justify-between p-2 bg-slate-100 rounded-md"
                  >
                    <span className="text-md font-medium">{topic}</span>
                    <Input
                      type="number"
                      min="1"
                      value={topicQuestionCounts[topic]}
                      onChange={(e) =>
                        setTopicQuestionCounts({
                          ...topicQuestionCounts,
                          [topic]: Number(e.target.value),
                        })
                      }
                      className="w-20 text-center"
                    />
                  </div>
                ))}
              </div>

              <Button
                onClick={generateQuestions}
                className="mt-4"
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin mr-2 w-4 h-4" /> Generating...
                  </>
                ) : (
                  "Generate Questions"
                )}
              </Button>

              <Button
                onClick={downloadWordDocument}
                className="mt-4 ml-2"
                disabled={generatedQuestions.length === 0}
              >
                Download as Word
              </Button>
            </div>
          )}

          {generatedQuestions.length > 0 && (
            <div className="mt-10">
              <h2 className="text-xl font-semibold mb-4">Generated Questions</h2>
              <div className="space-y-6">
                {Object.entries(
                  generatedQuestions.reduce<
                    Record<string, { id: string; topic: string; question: string }[]>
                  >((acc, q) => {
                    if (!acc[q.topic]) acc[q.topic] = [];
                    acc[q.topic].push(q);
                    return acc;
                  }, {})
                ).map(([topic, questions]) => (
                  <div key={topic}>
                    <h3 className="text-lg font-semibold text-blue-600 mb-2">{topic}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {questions.map((q, index) => (
                        <Card
                          key={q.id}
                          className="p-4 shadow-sm border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                        >
                          <h3 className="text-md font-medium">
                            {index + 1}. {q.question}
                          </h3>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
