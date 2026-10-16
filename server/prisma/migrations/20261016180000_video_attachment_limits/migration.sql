-- Approved MP4/WebM evidence: retain the existing non-video bound.
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_size";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size" CHECK (
  "byteSize" >= 0 AND "byteSize" <= CASE
    WHEN "contentType" IN ('video/mp4', 'video/webm') THEN 26214400
    ELSE 10485760
  END
);
