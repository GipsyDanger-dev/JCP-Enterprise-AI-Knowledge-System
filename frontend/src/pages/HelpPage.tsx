import { BookOpen, ChevronRight, ExternalLink, FileText, Mail, MessageSquareText, Phone } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useState } from 'react'

interface FaqItem {
  question: string
  answer: string
}

const FAQ: FaqItem[] = [
  {
    question: 'How do I upload a document?',
    answer: 'Go to Documents (admin) and click the "Upload document" button. Select a PDF or DOCX file. The system will automatically index it and make it searchable via AI.',
  },
  {
    question: 'How does AI citation work?',
    answer: 'When you ask a question, the AI searches through indexed documents and returns an answer with source citations. Each citation shows the document name, page number, and section title so you can verify the information.',
  },
  {
    question: 'What file formats are supported?',
    answer: 'Currently we support PDF (.pdf) and Microsoft Word (.docx) files. More formats will be added in future updates.',
  },
  {
    question: 'What is the difference between Admin and Employee roles?',
    answer: 'Admins have full access: upload/delete documents, manage users, and view all collections. Employees can browse the knowledge library, ask AI questions, and view collections they have access to.',
  },
  {
    question: "Why does my question return 'Information not found'?",
    answer: 'This means the AI could not find relevant information in the indexed documents. Try rephrasing your question, or check if the relevant document has been uploaded and indexed.',
  },
  {
    question: 'How do I manage collections?',
    answer: 'Collections are organizational groups for documents. Admins can assign documents to collections (Operations, IT & Security, People, Finance) during upload or via document settings.',
  },
]

export function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow="Support"
        title="Help center"
        detail="Find answers to common questions or contact support."
      />

      <div className="help-grid">
        {/* Quick links */}
        <section className="help-section">
          <h3>Quick links</h3>
          <div className="help-links">
            <a href="#" className="help-link-card" onClick={(e) => e.preventDefault()}>
              <span className="help-link-icon orange"><BookOpen size={18} /></span>
              <div>
                <strong>Getting started guide</strong>
                <small>Learn the basics of Enterprise AI</small>
              </div>
              <ExternalLink size={14} />
            </a>
            <a href="#" className="help-link-card" onClick={(e) => e.preventDefault()}>
              <span className="help-link-icon mint"><FileText size={18} /></span>
              <div>
                <strong>Document management</strong>
                <small>Upload, organize, and search documents</small>
              </div>
              <ExternalLink size={14} />
            </a>
            <a href="#" className="help-link-card" onClick={(e) => e.preventDefault()}>
              <span className="help-link-icon violet"><MessageSquareText size={18} /></span>
              <div>
                <strong>AI Assistant guide</strong>
                <small>How to ask effective questions</small>
              </div>
              <ExternalLink size={14} />
            </a>
          </div>
        </section>

        {/* FAQ */}
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

        {/* Contact */}
        <section className="help-section">
          <h3>Contact support</h3>
          <div className="help-contact-grid">
            <div className="help-contact-card">
              <Mail size={18} />
              <div>
                <strong>Email support</strong>
                <small>support@jcp.co.id</small>
                <p>Response within 24 hours</p>
              </div>
            </div>
            <div className="help-contact-card">
              <Phone size={18} />
              <div>
                <strong>Phone support</strong>
                <small>+62 274 xxx xxxx</small>
                <p>Mon–Fri, 09:00–17:00 WIB</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
