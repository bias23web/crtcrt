// src/components/MarkdownRenderer.jsx
import { useState, useEffect } from 'react';
import '../App.css';

function MarkdownRenderer({ markdown, className = '' }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!markdown) {
      setHtml('');
      return;
    }

    // Convert markdown to HTML
    const htmlContent = convertMarkdownToHtml(markdown);
    setHtml(htmlContent);
  }, [markdown]);

  // Advanced markdown to HTML converter
  function convertMarkdownToHtml(md) {
    if (!md) return '';

    // Split the markdown into lines
    let lines = md.split('\n');
    let htmlLines = [];
    let inCodeBlock = false;
    let inList = false;
    let listType = '';
    let codeBlockContent = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Handle code blocks
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockContent = '';
          continue;
        } else {
          inCodeBlock = false;
          htmlLines.push(`<pre><code>${escapeHtml(codeBlockContent.trim())}</code></pre>`);
          continue;
        }
      }

      if (inCodeBlock) {
        codeBlockContent += line + '\n';
        continue;
      }

      // Handle headers
      if (line.startsWith('# ')) {
        htmlLines.push(`<h1 class="break-words">${processInlineMarkdown(line.substring(2))}</h1>`);
        continue;
      }
      if (line.startsWith('## ')) {
        htmlLines.push(`<h2 class="break-words">${processInlineMarkdown(line.substring(3))}</h2>`);
        continue;
      }
      if (line.startsWith('### ')) {
        htmlLines.push(`<h3 class="break-words">${processInlineMarkdown(line.substring(4))}</h3>`);
        continue;
      }

      // Handle blockquotes
      if (line.startsWith('> ')) {
        htmlLines.push(`<blockquote class="break-words">${processInlineMarkdown(line.substring(2))}</blockquote>`);
        continue;
      }

      // Handle unordered lists
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        if (!inList || listType !== 'ul') {
          if (inList) htmlLines.push('</ul>');
          htmlLines.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        htmlLines.push(`<li class="break-words">${processInlineMarkdown(line.trim().substring(2))}</li>`);
        continue;
      }

      // Handle ordered lists
      if (/^\d+\.\s/.test(line.trim())) {
        if (!inList || listType !== 'ol') {
          if (inList) htmlLines.push(`</${listType}>`);
          htmlLines.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        const content = line.trim().replace(/^\d+\.\s/, '');
        htmlLines.push(`<li class="break-words">${processInlineMarkdown(content)}</li>`);
        continue;
      }

      // Close list if we're not on a list item anymore
      if (inList && line.trim() === '') {
        htmlLines.push(`</${listType}>`);
        inList = false;
      }

      // Handle paragraphs - add break-words class to all paragraphs
      if (line.trim() !== '') {
        htmlLines.push(`<p class="break-words">${processInlineMarkdown(line)}</p>`);
      } else if (!inList && htmlLines.length > 0 && !htmlLines[htmlLines.length - 1].endsWith('</p>')) {
        // Add empty paragraph for spacing when needed
        htmlLines.push('<p></p>');
      }
    }

    // Close any remaining lists
    if (inList) {
      htmlLines.push(`</${listType}>`);
    }

    return htmlLines.join('');
  }

  // Process inline markdown elements
  function processInlineMarkdown(text) {
    // Handle code specifically to add break-words
    text = text.replace(/`([^`]+)`/g, '<code class="break-all">$1</code>');
    
    // Handle bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Handle italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Handle links
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="break-words">$1</a>');
    
    // Handle images
    text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');
    
    return text;
  }

  // Helper function to escape HTML in code blocks
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return (
    <div 
      className={`markdown-content overflow-hidden break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownRenderer;