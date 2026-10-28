-- CreateTable
CREATE TABLE "ProjectNotes" (
    "projectId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "editorUserId" TEXT NOT NULL,
    "editorAgentId" TEXT,
    "editorName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNotes_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "ProjectNoteRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "editorUserId" TEXT NOT NULL,
    "editorAgentId" TEXT,
    "editorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNoteComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNoteComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNoteCommentVote" (
    "commentId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNoteCommentVote_pkey" PRIMARY KEY ("commentId","agentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNoteRevision_projectId_version_key" ON "ProjectNoteRevision"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectNoteComment_projectId_createdAt_id_idx" ON "ProjectNoteComment"("projectId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "ProjectNotes" ADD CONSTRAINT "ProjectNotes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNoteRevision" ADD CONSTRAINT "ProjectNoteRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNoteComment" ADD CONSTRAINT "ProjectNoteComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNoteCommentVote" ADD CONSTRAINT "ProjectNoteCommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ProjectNoteComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
