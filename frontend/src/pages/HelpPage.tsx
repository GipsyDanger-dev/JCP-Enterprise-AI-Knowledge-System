import { ChevronRight } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useState } from 'react'

interface FaqItem {
  question: string
  answer: string
}

const FAQ: FaqItem[] = [
  {
    question: 'How do I upload a document?',
    answer: 'Admins can open Documents and select Upload document. Upload a valid PDF or DOCX file up to 10 MB; its status will show while the backend processes it.',
  },
  {
    question: 'How does AI citation work?',
    answer: 'When you ask a question, the AI searches through indexed documents and returns an answer with source citations. Each citation shows the document name, page number, and section title so you can verify the information.',
  },
  {
    question: 'What file formats are supported?',
    answer: 'The document API accepts valid PDF (.pdf) and Microsoft Word (.docx) files up to 10 MB.',
  },
  {
    question: 'What is the difference between Admin and Employee roles?',
    answer: 'Admins can upload and delete documents, inspect processing status, and manage users. Employees can browse ready documents and ask grounded questions.',
  },
  {
    question: "Why does my question return 'Information not found'?",
    answer: 'This means the AI could not find relevant information in the indexed documents. Try rephrasing your question, or check if the relevant document has been uploaded and indexed.',
  },
]

export function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow="Support"
        title="Help center"
        detail="Find answers about the available knowledge workflows."
      />

      <div className="help-grid">
        <section className="help-section">
          <h3>Frequently asked questions</h3>
          <div className="faq-list">
            {FAQ.map((item, index) => (
              <div key={index} className={`faq-item ${openIndex === index ? 'open' : ''}`}>
                <button className="faq-question" onClick={() => setOpenIndex(openIndex === index ? null : index)}>
                  <span>{item.question}</span>
                  <ChevronRight size={16} className="faq-chevron" />
                </button>
                {openIndex === index && (
                  <div className="faq-answer">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
