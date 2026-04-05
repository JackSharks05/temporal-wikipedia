/**
 * @typedef {Object} Revision
 * @property {string} revId
 * @property {string} timestamp
 * @property {string} content
 */

/**
 * @typedef {Object} Delta
 * @property {string} revId
 * @property {string} parentId
 * @property {string} timestamp
 * @property {string} patch - Unified diff format
 */

/**
 * @typedef {Object} Article
 * @property {string} title
 * @property {string} pageId
 * @property {Revision} base - First (oldest) revision, stored in full
 * @property {Delta[]} deltas - Subsequent revisions, stored as patches
 * @property {string[]} links - Internal wiki links
 * @property {number} revisionCount
 */

module.exports = {}