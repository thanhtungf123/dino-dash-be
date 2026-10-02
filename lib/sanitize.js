import sanitizeHtml from 'sanitize-html';

/**
 * Lọc HTML do admin soạn (từ editor Quill) để chống XSS.
 * Chỉ giữ các thẻ/thuộc tính an toàn; tự loại <script>, onclick, javascript: ...
 */
export function cleanHtml(dirty) {
  return sanitizeHtml(String(dirty ?? ''), {
    allowedTags: [
      'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
      'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'img', 'span', 'div', 'hr',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['class', 'style'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // Link mở tab mới + an toàn.
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
    },
  });
}

/**
 * Lọc văn bản THUẦN (không cho phép HTML): loại mọi thẻ, gộp khoảng trắng,
 * cắt đầu/cuối và giới hạn độ dài. Dùng cho các ô nhập của người chơi
 * (họ tên, số tài khoản, ghi chú...).
 */
export function cleanText(dirty, maxLen = 200) {
  const noTags = sanitizeHtml(String(dirty ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
  });
  return noTags.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
