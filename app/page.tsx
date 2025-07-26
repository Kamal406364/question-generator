import QuestionGenerator from "@/components/question-generator"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12">
      <div className="container px-4 mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">Automated Question Generator</h1>
        <p className="text-slate-600 text-center mb-8">
          Upload educational material to generate questions based on topics
        </p>
        <QuestionGenerator />
      </div>
    </main>
  )
}

