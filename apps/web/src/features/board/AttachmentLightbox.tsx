import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import { attachmentKind, type Attachment } from '@taskterm/shared';
import { attachmentUrl } from '../../api/attachments';

/** Просмотр картинок и видео: листание, зум, миниатюры. Подгружается лениво (React.lazy), пока никто не открыл файл */
export default function AttachmentLightbox({ items, index, onClose }: { items: Attachment[]; index: number; onClose: () => void }) {
  const slides = items.map((a) =>
    attachmentKind(a.mime) === 'video'
      ? { type: 'video' as const, title: a.name, sources: [{ src: attachmentUrl(a.id), type: a.mime }] }
      : { type: 'image' as const, title: a.name, src: attachmentUrl(a.id) },
  );
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Video, Zoom, Thumbnails]}
      video={{ controls: true, playsInline: true, preload: 'metadata' }}
      carousel={{ finite: slides.length < 2 }}
      styles={{ container: { backgroundColor: 'rgba(0, 0, 0, 0.92)' } }}
    />
  );
}
