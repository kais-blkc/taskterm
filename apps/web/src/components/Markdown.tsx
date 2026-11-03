import ReactMarkdown from 'react-markdown';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown md">
      <ReactMarkdown
        components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
