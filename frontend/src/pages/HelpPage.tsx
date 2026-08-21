import { BookOpen, ChevronRight, ExternalLink, FileText, Mail, MessageSquareText, Phone } from 'lucide-react'
import { PageHeading } from '@/components/PageHeading'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/hooks/useWorkspace'

interface FaqItem {
  question: string
  answer: string
}

const FAQ_ID: FaqItem[] = [
  { question: 'Bagaimana cara mengunggah dokumen?', answer: 'Buka Dokumen (admin) dan klik tombol "Unggah dokumen". Pilih file PDF atau DOCX. Sistem akan secara otomatis mengindeksnya dan membuatnya dapat dicari melalui AI.' },
  { question: 'Bagaimana cara sitasi AI bekerja?', answer: 'Saat Anda mengajukan pertanyaan, AI mencari melalui dokumen yang sudah diindeks dan mengembalikan jawaban dengan sitasi sumber. Setiap sitasi menunjukkan nama dokumen, nomor halaman, dan judul bagian.' },
  { question: 'Format file apa yang didukung?', answer: 'Saat ini kami mendukung file PDF (.pdf) dan Microsoft Word (.docx). Format lain akan ditambahkan di pembaruan mendatang.' },
  { question: 'Apa perbedaan peran Admin dan Karyawan?', answer: 'Admin memiliki akses penuh: mengunggah/menghapus dokumen, mengelola pengguna, dan melihat semua koleksi. Karyawan dapat menjelajahi perpustakaan pengetahuan, mengajukan pertanyaan AI, dan melihat koleksi yang dapat diakses.' },
  { question: 'Mengapa pertanyaan saya mengembalikan "Informasi tidak ditemukan"?', answer: 'Ini berarti AI tidak menemukan informasi yang relevan dalam dokumen yang diindeks. Coba rumuskan ulang pertanyaan Anda, atau periksa apakah dokumen yang relevan sudah diunggah dan diindeks.' },
  { question: 'Bagaimana cara mengelola koleksi?', answer: 'Koleksi adalah kelompok organisasi untuk dokumen. Admin dapat menugaskan dokumen ke koleksi (Operations, IT & Security, People, Finance) saat pengunggahan atau melalui pengaturan dokumen.' },
]

const FAQ_EN: FaqItem[] = [
  { question: 'How do I upload a document?', answer: 'Go to Documents (admin) and click the "Upload document" button. Select a PDF or DOCX file. The system will automatically index it and make it searchable via AI.' },
  { question: 'How does AI citation work?', answer: 'When you ask a question, the AI searches through indexed documents and returns an answer with source citations. Each citation shows the document name, page number, and section title so you can verify the information.' },
  { question: 'What file formats are supported?', answer: 'Currently we support PDF (.pdf) and Microsoft Word (.docx) files. More formats will be added in future updates.' },
  { question: 'What is the difference between Admin and Employee roles?', answer: 'Admins have full access: upload/delete documents, manage users, and view all collections. Employees can browse the knowledge library, ask AI questions, and view collections they have access to.' },
  { question: "Why does my question return 'Information not found'?", answer: 'This means the AI could not find relevant information in the indexed documents. Try rephrasing your question, or check if the relevant document has been uploaded and indexed.' },
  { question: 'How do I manage collections?', answer: 'Collections are organizational groups for documents. Admins can assign documents to collections (Operations, IT & Security, People, Finance) during upload or via document settings.' },
]

export function HelpPage() {
  const navigate = useNavigate()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const { language } = useWorkspace()
  const isId = language === 'id'
  const FAQ = isId ? FAQ_ID : FAQ_EN
  const faqRef = useRef<HTMLDivElement>(null)

  // Panduan memulai: open FAQ items 0-2 (upload, citation, formats)
  const scrollToGuide = useCallback(() => {
    setOpenIndex(0)
    setTimeout(() => {
      faqRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  return (
    <div className="standard-page">
      <PageHeading
        eyebrow={isId ? 'Dukungan' : 'Support'}
        title={isId ? 'Pusat bantuan' : 'Help center'}
        detail={isId ? 'Temukan jawaban untuk pertanyaan umum atau hubungi dukungan.' : 'Find answers to common questions or contact support.'}
      />

      <div className="help-grid">
        {/* Quick links */}
        <section className="help-section">
          <h3>{isId ? 'Tautan cepat' : 'Quick links'}</h3>
          <div className="help-links">
            <button className="help-link-card" onClick={scrollToGuide}>
              <span className="help-link-icon orange"><BookOpen size={18} /></span>
              <div>
                <strong>{isId ? 'Panduan memulai' : 'Getting started guide'}</strong>
                <small>{isId ? 'Pelajari dasar Enterprise AI' : 'Learn the basics of Enterprise AI'}</small>
              </div>
              <ExternalLink size={14} />
            </button>
            <button className="help-link-card" onClick={() => navigate('/documents')}>
              <span className="help-link-icon mint"><FileText size={18} /></span>
              <div>
                <strong>{isId ? 'Manajemen dokumen' : 'Document management'}</strong>
                <small>{isId ? 'Unggah, organisasi, dan cari dokumen' : 'Upload, organize, and search documents'}</small>
              </div>
              <ExternalLink size={14} />
            </button>
            <button className="help-link-card" onClick={() => navigate('/chat')}>
              <span className="help-link-icon violet"><MessageSquareText size={18} /></span>
              <div>
                <strong>{isId ? 'Panduan Asisten AI' : 'AI Assistant guide'}</strong>
                <small>{isId ? 'Cara mengajukan pertanyaan yang efektif' : 'How to ask effective questions'}</small>
              </div>
              <ExternalLink size={14} />
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section className="help-section" ref={faqRef}>
          <h3>{isId ? 'Pertanyaan yang sering diajukan' : 'Frequently asked questions'}</h3>
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
          <h3>{isId ? 'Hubungi dukungan' : 'Contact support'}</h3>
          <div className="help-contact-grid">
            <div className="help-contact-card">
              <Mail size={18} />
              <div>
                <strong>{isId ? 'Dukungan email' : 'Email support'}</strong>
                <small>support@jcp.co.id</small>
                <p>{isId ? 'Respons dalam 24 jam' : 'Response within 24 hours'}</p>
              </div>
            </div>
            <div className="help-contact-card">
              <Phone size={18} />
              <div>
                <strong>{isId ? 'Dukungan telepon' : 'Phone support'}</strong>
                <small>+62 274 xxx xxxx</small>
                <p>{isId ? 'Sen–Jum, 09:00–17:00 WIB' : 'Mon–Fri, 09:00–17:00 WIB'}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
