"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { LocalTime } from "@/components/local-time";
import {
  MAX_COMMENT_DEPTH,
  truncateCommentBody,
  type CommentNode,
} from "@/lib/comments";
import { canDeleteComment, canEditComment } from "@/lib/comment-permissions";
import type { AppRole } from "@/lib/roles";
import type { OrganizationRole } from "@/lib/organization-role";
import type { CommentType } from "@/lib/validations/issue";
import { decisionStageInfo, stageOfComment, type DecisionStage, type StageStarts } from "@/lib/decision-stages";
import { StageIcon, stageIconName } from "@/components/issue-progress-report";

const NO_STAGE_STARTS: StageStarts = { open: null, done: null, ready: null, live: null };
import { deleteCommentAction, updateCommentAction } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { CommentBody, MentionText } from "@/components/comment-body";
import { CommentForm } from "@/components/comment-form";
import { MarkdownEditor } from "@/components/markdown-editor";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { CopyLinkButton } from "@/components/copy-link-button";
import { AttachmentList, type AttachmentView } from "@/components/attachment-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type AttachmentsByComment = Record<string, AttachmentView[]>;
/** Each author's role in the issue's organization, by user id (#489). */
type OrganizationRoles = Record<string, OrganizationRole>;
type ViewerProps = {
  currentUserId?: string;
  currentUserRole?: AppRole | null;
  tenantAdmin?: boolean;
  readOnly?: boolean;
};

type UserOption = { id: string; name: string };

const commentTypeVisual: Record<
  CommentType,
  { label: string; chip: string; filterOn: string }
> = {
  comment: {
    label: "Comment",
    chip: "bg-zk-chip text-zk-text2",
    filterOn: "border-transparent bg-zk-chip text-zk-text2",
  },
  bid: {
    label: "Bid",
    chip: "bg-zk-warn-bg text-zk-warn-fg",
    filterOn: "border-transparent bg-zk-warn-bg text-zk-warn-fg",
  },
  review: {
    label: "Review",
    chip: "bg-zk-info-bg text-zk-info-fg",
    filterOn: "border-transparent bg-zk-info-bg text-zk-info-fg",
  },
  delivery: {
    label: "Delivery",
    chip: "bg-zk-ok-bg text-zk-ok-fg",
    filterOn: "border-transparent bg-zk-ok-bg text-zk-ok-fg",
  },
  request_to_merge: {
    label: "Merge request",
    chip: "bg-[var(--issue-sec-bg,#FDECEF)] text-[var(--issue-sec-fg,#B4233F)]",
    filterOn: "border-transparent bg-[var(--issue-sec-bg,#FDECEF)] text-[var(--issue-sec-fg,#B4233F)]",
  },
};

function CommentTypeBadge({ type, metadata }: { type?: CommentType | null; metadata?: unknown }) {
  const resolved: CommentType = type && type in commentTypeVisual ? type : "comment";
  const visual = commentTypeVisual[resolved];
  const meta = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${visual.chip}`}
    >
      <span>{visual.label}</span>
      {resolved === "bid" && typeof meta?.eta === "string" ? (
        <span>· ETA: {meta.eta}</span>
      ) : null}
      {resolved === "review" && typeof meta?.verdict === "string" ? (
        <span>· {meta.verdict}</span>
      ) : null}
      {resolved === "delivery" && typeof meta?.prUrl === "string" ? (
        <a
          href={meta.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          PR
        </a>
      ) : null}
    </span>
  );
}

function CommentConfidence({ metadata }: { metadata?: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const { confidence, confidenceReason } = metadata as Record<string, unknown>;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) return null;
  return (
    <div className="mt-2 rounded-[10px] bg-zk-chip px-3 py-2 text-[13px] text-zk-text2 break-words">
      <strong className="font-semibold text-zk-text">Self-reported confidence: {confidence}%</strong>
      {typeof confidenceReason === "string" && confidenceReason.trim() ? ` — ${confidenceReason}` : null}
    </div>
  );
}

function CommentEditForm({
  comment,
  users,
  onDone,
}: {
  comment: CommentNode;
  users: UserOption[];
  onDone: () => void;
}) {
  const [body, setBody] = useState(comment.body);
  const [editorUploading, setEditorUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unchanged = body.trim() === comment.body.trim();

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(event) => {
        if (pending || editorUploading) {
          event.preventDefault();
        }
      }}
      action={(formData) => {
        if (pending || editorUploading) return;
        setError(null);
        startTransition(async () => {
          const result = await updateCommentAction(comment.id, formData);
          if (result.error) setError(result.error);
          else onDone();
        });
      }}
    >
      <MarkdownEditor
        id={`edit-${comment.id}`}
        name="body"
        required
        rows={3}
        maxLength={2000}
        value={body}
        onChange={setBody}
        onUploadingChange={setEditorUploading}
        users={users}
        renderMentions={(text) => <MentionText text={text} users={users} />}
        aria-label="Edit comment"
      />
      {error ? (
        <p className="text-sm text-zk-bad-fg" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !body.trim() || unchanged || editorUploading}>
          {pending ? "Saving…" : editorUploading ? "Uploading…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Small pencil button that opens Edit/Delete, showing only what the viewer may
 * do. A disclosure, not an ARIA menu: Tab moves through the two buttons, and
 * Escape closes it and puts focus back on the pencil.
 */
function CommentActionsMenu({
  canEdit,
  canDelete,
  deleting,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Focus inside the popup would fall to the page once it unmounts.
      if (rootRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "block w-full px-3 py-1.5 text-left text-[13px] hover:bg-zk-chip focus-visible:bg-zk-chip focus-visible:outline-none disabled:opacity-50";

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Comment actions"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zk-muted hover:bg-zk-chip hover:text-zk-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11.2 2.3a1.6 1.6 0 0 1 2.3 2.3L5.4 12.7l-3 .8.8-3z" />
        </svg>
      </button>
      {open ? (
        <span
          id={panelId}
          className="absolute right-0 top-7 z-20 min-w-28 overflow-hidden rounded-lg border border-zk-border bg-zk-surface py-1 shadow-lg"
        >
          {canEdit ? (
            <button
              type="button"
              className={`${itemClass} text-zk-text`}
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Edit
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              disabled={deleting}
              className={`${itemClass} text-zk-bad-fg`}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function CommentItem({
  comment,
  bugId,
  issueUrl,
  reporterId,
  users,
  currentUserId,
  currentUserRole,
  tenantAdmin = false,
  attachmentsByComment = {},
  organizationRoles = {},
  readOnly = false,
}: {
  comment: CommentNode;
  bugId: string;
  /** Canonical issue URL, for each comment's permalink (#279). */
  issueUrl: string;
  reporterId: string;
  users: UserOption[];
  attachmentsByComment?: AttachmentsByComment;
  organizationRoles?: OrganizationRoles;
} & ViewerProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const isDeleted = Boolean(comment.deletedAt);
  const canReply =
    !readOnly && comment.depth < MAX_COMMENT_DEPTH && !isDeleted;
  const canEdit = !readOnly && canEditComment(currentUserId, comment);
  const canDelete =
    !readOnly && canDeleteComment(currentUserId, currentUserRole, comment, tenantAdmin);

  const handleDelete = async () => {
    const own = comment.authorId === currentUserId;
    const confirmed = await confirm({
      title: own ? "Delete your comment?" : `Delete ${comment.author.name}'s comment?`,
      body: own
        ? "Replies will stay, and the comment will show as deleted."
        : "This is recorded in the activity log.",
      confirmLabel: "Delete comment",
      tone: "danger",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCommentAction(comment.id);
      if (result.error) {
        setError(result.error);
        toast(result.error, "error");
      } else {
        toast("Comment deleted.");
      }
    });
  };

  return (
    <li
      id={`comment-${comment.id}`}
      // :target is the comment a permalink points at (#279); the highlight
      // needs no script, so it works on first load and on hash changes.
      // break-inside keeps a comment whole across printed pages (#300).
      className="group/comment scroll-mt-24 space-y-3 break-inside-avoid"
    >
      {/* One thin border per comment; no coloured type stripe (that read as a double border). */}
      <article className="flex flex-col gap-2.5 rounded-xl border border-zk-border bg-zk-surface px-4 py-3 group-target/comment:border-zk-accent group-target/comment:bg-zk-tint group-target/comment:ring-2 group-target/comment:ring-electric-blue/40 motion-safe:transition-colors">
        {isDeleted ? (
          <p className="text-sm italic text-zk-muted">This comment was deleted.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-zk-muted">
              <div className="flex flex-wrap items-center gap-2">
                <UserNameWithBadges
                  name={comment.author.name}
                  role={comment.author.role}
                  organizationRole={organizationRoles[comment.authorId]}
                  image={comment.author.image}
                  avatar="sm"
                  userId={comment.authorId}
                  showAuthor={comment.authorId === reporterId}
                  agentName={comment.agent?.name}
                  className="font-bold text-zk-text"
                />
                <CommentTypeBadge type={comment.type} metadata={comment.metadata} />
              </div>
              <span className="inline-flex items-center gap-1.5">
                <a
                  href={`#comment-${comment.id}`}
                  className="hover:text-zk-text hover:underline"
                >
                  <LocalTime compact date={comment.createdAt} />
                </a>
                <CopyLinkButton
                  url={`${issueUrl}#comment-${comment.id}`}
                  label="comment"
                  compact
                />
                {comment.editedAt ? (
                  <span title="This comment was edited">· edited</span>
                ) : null}
                {!editing && (canEdit || canDelete) ? (
                  <CommentActionsMenu
                    canEdit={canEdit}
                    canDelete={canDelete}
                    deleting={pending}
                    onEdit={() => setEditing(true)}
                    onDelete={handleDelete}
                  />
                ) : null}
              </span>
            </div>

            {comment.agentId || comment.agent ? <CommentConfidence metadata={comment.metadata} /> : null}

            {comment.parent ? (
              <p className="mt-2 rounded-md bg-card/80 px-2.5 py-1.5 text-xs text-zk-muted break-words">
                Replying to{" "}
                <span className="font-bold text-zk-text">
                  {comment.parent.author.name}
                </span>
                {": "}
                <span className="italic text-zk-text2">
                  {comment.parent.deletedAt
                    ? "deleted comment"
                    : truncateCommentBody(comment.parent.body)}
                </span>
              </p>
            ) : null}

            {editing ? (
              <CommentEditForm
                comment={comment}
                users={users}
                onDone={() => setEditing(false)}
              />
            ) : (
              <>
                <CommentBody body={comment.body} users={users} />
                <AttachmentList attachments={attachmentsByComment[comment.id] ?? []} />
              </>
            )}
          </>
        )}

        {!editing && canReply ? (
          <div>
            {replying ? (
              <CommentForm
                bugId={bugId}
                users={users}
                viewerId={currentUserId}
                parentId={comment.id}
                parentAuthorName={comment.author.name}
                onCancel={() => setReplying(false)}
                onSuccess={() => setReplying(false)}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="-ml-2 min-h-8 px-2 py-1 text-[13px] font-bold text-zk-accent hover:text-zk-accent"
                onClick={() => setReplying(true)}
              >
                Reply
              </Button>
            )}
          </div>
        ) : null}
        {/* Outside the Reply block: a delete can fail on a comment that can't take replies. */}
        {error ? (
          <p className="text-xs text-zk-bad-fg" role="alert">
            {error}
          </p>
        ) : null}
      </article>

      {comment.children.length > 0 ? (
        <ul className="ml-2.5 space-y-3 border-l border-zk-divider pl-2.5 sm:ml-6 sm:pl-4">
          {comment.children.map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              bugId={bugId}
              issueUrl={issueUrl}
              reporterId={reporterId}
              users={users}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              tenantAdmin={tenantAdmin}
              attachmentsByComment={attachmentsByComment}
              organizationRoles={organizationRoles}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CommentThread({
  bugId,
  issueUrl,
  reporterId,
  comments,
  users,
  currentUserId,
  currentUserRole,
  tenantAdmin = false,
  attachmentsByComment = {},
  organizationRoles = {},
  readOnly = false,
  inlineComposer = true,
  stage = null,
  stageStarts = NO_STAGE_STARTS,
}: {
  bugId: string;
  issueUrl: string;
  reporterId: string;
  comments: CommentNode[];
  users: UserOption[];
  /** False when the page offers an "Add comment" modal instead of a form under the thread. */
  inlineComposer?: boolean;
  /** Files attached to each comment, by comment id (#215). */
  attachmentsByComment?: AttachmentsByComment;
  organizationRoles?: OrganizationRoles;
  /** #1446: show only the comments of this progress stage, drawn as the design. */
  stage?: DecisionStage | null;
  /** When each stage began, to place reviews and plain comments. */
  stageStarts?: StageStarts;
} & ViewerProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const stageComments = stage
    ? comments.filter((comment) => stageOfComment(comment.type, comment.createdAt, stageStarts) === stage)
    : comments;

  const filteredComments = stageComments.filter((comment) => {
    if (typeFilter === "all") return true;
    const cType = comment.type || "comment";
    return cType === typeFilter;
  });

  // Counted the same way the filter works: by top-level comment type.
  const countFor = (id: string) =>
    id === "all" ? stageComments.length : stageComments.filter((comment) => (comment.type || "comment") === id).length;

  const filters: { id: string; label: string; type?: CommentType }[] = [
    { id: "all", label: "All" },
    { id: "comment", label: "Comments", type: "comment" },
    { id: "bid", label: "Bids", type: "bid" },
    { id: "review", label: "Reviews", type: "review" },
    { id: "delivery", label: "Deliveries", type: "delivery" },
    { id: "request_to_merge", label: "Merge requests", type: "request_to_merge" },
  ];

  return (
    <div className={`issue-detail-scope mt-0 space-y-4${stage ? " issue-progress" : ""}`}>
      {/* #186: with a stage picked, the stage summary above the thread replaces the type tabs. */}
      {!stage && comments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((tab) => {
            const on = typeFilter === tab.id;
            const typeStyle = tab.type ? commentTypeVisual[tab.type].filterOn : null;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTypeFilter(tab.id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong ${
                  on
                    ? typeStyle ?? "border-electric-blue-strong bg-electric-blue-strong text-white"
                    : "border-zk-border bg-zk-surface text-zk-text2 hover:text-zk-text"
                }`}
              >
                {tab.label}
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums ${
                    on ? "bg-white/25" : "bg-zk-chip text-zk-muted"
                  }`}
                >
                  {countFor(tab.id)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {stage && filteredComments.length === 0 ? (
        <div role="status" className="emp lg !flex-row !items-center">
          <span className="emp-icon">
            <StageIcon name={stageIconName[stage]} />
          </span>
          <span className="text-[13px] leading-normal text-zk-muted">
            No comments at the <b className="text-zk-text">{decisionStageInfo[stage].label}</b> stage yet.
          </span>
        </div>
      ) : comments.length === 0 && !readOnly ? (
        <div role="status" className="rounded-2xl border border-dashed border-zk-border bg-zk-chip/40 px-4 py-8 text-center">
          <p className="text-sm font-medium text-zk-text">No comments yet.</p>
          <p className="mt-1 text-sm text-zk-muted">
            Agents and reviewers haven’t posted any updates here yet.
          </p>
          <p className="mt-2 text-sm text-zk-text2">
            {inlineComposer
              ? "Start the conversation below with a question, helpful context, or a proposed solution."
              : "Use Add comment to ask a question, add context, or propose a solution."}
          </p>
        </div>
      ) : filteredComments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zk-border px-4 py-8 text-center text-sm text-zk-muted">
          {comments.length > 0
            ? "No timeline entries match this filter."
            : "No conversation."}
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              bugId={bugId}
              issueUrl={issueUrl}
              reporterId={reporterId}
              users={users}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              tenantAdmin={tenantAdmin}
              attachmentsByComment={attachmentsByComment}
              organizationRoles={organizationRoles}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
      {readOnly || !inlineComposer ? null : (
        <CommentForm bugId={bugId} users={users} viewerId={currentUserId} />
      )}
    </div>
  );
}
