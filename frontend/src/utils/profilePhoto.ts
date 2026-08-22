const MAX_INPUT_BYTES = 8 * 1024 * 1024
const MAX_OUTPUT_CHARACTERS = 180_000
const MAX_DIMENSION = 512

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Foto tidak dapat diproses'))
    image.src = source
  })
}

export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih file gambar yang valid')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Ukuran foto maksimal 8MB')

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Foto tidak dapat dibaca'))
    reader.readAsDataURL(file)
  })
  const image = await loadImage(source)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)

  for (const quality of [0.82, 0.68, 0.54]) {
    const output = canvas.toDataURL('image/jpeg', quality)
    if (output.length <= MAX_OUTPUT_CHARACTERS) return output
  }
  throw new Error('Foto terlalu besar setelah dikompresi. Gunakan gambar lain.')
}
