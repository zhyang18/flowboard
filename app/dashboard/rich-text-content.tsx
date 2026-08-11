import Image from "next/image";

type RichTextContentProps = {
  value: string;
  emptyText?: string;
};

const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\((\/api\/attachments\/[0-9a-f-]+\/content)\)$/i;

/**
 * 安全渲染纯文本说明和由系统生成的附件图片标记。
 *
 * @param value 图文说明内容。
 * @param emptyText 内容为空时显示的占位文本。
 * @return 图文说明组件。
 */
export default function RichTextContent({ value, emptyText = "暂无说明。" }: RichTextContentProps) {
  if (!value.trim()) return <div className="rich-text-content empty">{emptyText}</div>;
  return (
    <div className="rich-text-content">
      {value.split("\n").map((line, index) => {
        const image = line.trim().match(IMAGE_LINE_PATTERN);
        if (image) {
          return (
            <span className="rich-text-image" key={`${image[2]}-${index}`}>
              <Image src={image[2]} alt={image[1] || "说明图片"} width={960} height={540} unoptimized />
            </span>
          );
        }
        return <span className="rich-text-line" key={`${index}-${line}`}>{line || "\u00a0"}</span>;
      })}
    </div>
  );
}
