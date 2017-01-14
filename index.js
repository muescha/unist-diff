'use strict';

var array = require('x-is-array');
var object = require('is-object');
var proto = require('getprototypeof');

var ignoredKeys = ['type', 'children', 'value'];

module.exports = diff;

function diff(left, right) {
  var patch = {left: left};
  walk(left, right, patch, 0);
  return patch;
}

function walk(left, right, patch, index) {
  var apply = patch[index];

  if (left === right) {
    return;
  }

  if (!right) {
    apply = append(apply, {type: 'remove', left: left, right: null});
  } else if (!left) {
    apply = append(apply, {type: 'insert', left: null, right: right});
  } else if (left.type === right.type) {
    apply = diffProperties(apply, left, right);

    /* Nodes of the same type must be of the same kind: if `right` is a
     * text, so is `left`. */
    if (text(right)) {
      apply = diffText(apply, left, right);
    } else if (parent(right)) {
      apply = diffChildren(apply, left, right, patch, index);
    }
  } else {
    apply = append(apply, {type: 'replace', left: left, right: right});
  }

  if (apply) {
    patch[index] = apply;
  }
}

function diffText(apply, left, right) {
  return left.value === right.value ?
    undefined :
    append(apply, {type: 'text', left: left, right: right});
}

function diffChildren(apply, left, right, patch, offset) {
  var leftChildren = left.children;
  var ordered = reorder(leftChildren, right.children);
  var children = ordered.children;
  var length = children.length;
  var index = -1;
  var leftChild;
  var rightChild;

  while (++index < length) {
    leftChild = leftChildren[index];
    rightChild = children[index];
    offset++;

    if (leftChild) {
      walk(leftChild, rightChild, patch, offset);
    } else {
      /* Excess nodes in `right` need to be added */
      apply = append(apply, {type: 'insert', left: null, right: rightChild});
    }

    offset += size(leftChild);
  }

  if (ordered.moves) {
    /* Reorder nodes last */
    apply = append(apply, {type: 'order', left: left, right: ordered.moves});
  }

  return apply;
}

function diffProperties(apply, left, right) {
  var diff = diffObjects(left, right);
  return diff ? append(apply, {type: 'props', left: left, right: diff}) : undefined;
}

function diffObjects(left, right) {
  var diff;
  var leftKey;
  var rightKey;
  var leftValue;
  var rightValue;
  var objectDiff;

  for (leftKey in left) {
    if (ignoredKeys.indexOf(leftKey) !== -1) {
      continue;
    }

    if (!(leftKey in right)) {
      diff = diff || {};
      diff[leftKey] = undefined;
    }

    leftValue = left[leftKey];
    rightValue = right[leftKey];

    if (leftValue === rightValue) {
      continue;
    }

    if (object(leftValue) && object(rightValue)) {
      if (proto(rightValue) === proto(leftValue)) {
        objectDiff = diffObjects(leftValue, rightValue);

        if (objectDiff) {
          diff = diff || {};
          diff[leftKey] = objectDiff;
        }
      } else {
        diff = diff || {};
        diff[leftKey] = rightValue;
      }
    } else {
      diff = diff || {};
      diff[leftKey] = rightValue;
    }
  }

  for (rightKey in right) {
    if (ignoredKeys.indexOf(rightKey) !== -1) {
      continue;
    }

    if (!(rightKey in left)) {
      diff = diff || {};
      diff[rightKey] = right[rightKey];
    }
  }

  return diff;
}

function append(apply, patch) {
  if (!apply) {
    return patch;
  }

  if (array(apply)) {
    apply.push(patch);
    return apply;
  }

  return [apply, patch];
}

/* List diff, naive left to right reordering */
function reorder(leftChildren, rightChildren) {
  var leftChildIndex = keyIndex(leftChildren);
  var leftKeys = leftChildIndex.key;
  var leftIndex = leftChildIndex.index;
  var rightChildIndex = keyIndex(rightChildren);
  var rightKeys = rightChildIndex.key;
  var rightIndex = rightChildIndex.index;
  var removes = [];
  var inserts = [];
  var leftLength = leftChildren.length;
  var rightLength = rightChildren.length;
  var leftOffset = 0;
  var rightOffset = 0;
  var leftKey = leftIndex[leftOffset];
  var rightKey = rightIndex[rightOffset];
  var leftMoved = [];
  var rightMoved = [];
  var leftDistance;
  var rightDistance;
  var index = -1;
  var next = [];
  var key;

  while (++index < leftLength) {
    key = leftIndex[index];

    if (key in rightKeys) {
      next.push(rightChildren[rightKeys[key]]);
    } else {
      next.push(null);
    }
  }

  index = -1;

  while (++index < rightLength) {
    key = rightIndex[index];

    if (!(key in leftKeys)) {
      next.push(rightChildren[index]);
    }
  }

  while (leftOffset < leftLength || rightOffset < rightLength) {
    /* The left node moved already. */
    if (leftMoved.indexOf(leftOffset) !== -1) {
      removes.push({
        from: leftOffset,
        left: leftChildren[leftOffset],
        right: rightChildren[rightKeys[leftKey]]
      });

      leftKey = leftIndex[++leftOffset];
    /* The right node moved already. */
    } else if (rightMoved.indexOf(rightOffset) !== -1) {
      removes.push({
        from: rightOffset,
        left: leftChildren[leftKeys[rightKey]],
        right: rightChildren[rightOffset]
      });

      rightKey = rightIndex[++rightOffset];
    } else if (!rightKey) {
      leftKey = leftIndex[++leftOffset];
    } else if (!leftKey) {
      rightKey = rightIndex[++rightOffset];
    } else if (!(leftKey in rightKeys)) {
      leftKey = leftIndex[++leftOffset];
    } else if (!(rightKey in leftKeys)) {
      rightKey = rightIndex[++rightOffset];
    } else if (rightKey === leftKey) {
      leftKey = leftIndex[++leftOffset];
      rightKey = rightIndex[++rightOffset];
    } else {
      leftDistance = leftKeys[rightKey] - leftOffset;
      rightDistance = rightKeys[leftKey] - rightOffset;

      if (leftDistance > rightDistance) {
        inserts.push({
          to: rightOffset,
          left: leftChildren[leftKeys[rightKey]],
          right: rightChildren[rightOffset]
        });

        leftMoved.push(leftKeys[rightKey]);
        rightKey = rightIndex[++rightOffset];
      } else {
        inserts.push({
          to: leftOffset,
          left: leftChildren[leftOffset],
          right: rightChildren[rightKeys[leftKey]]
        });

        rightMoved.push(rightKeys[leftKey]);
        leftKey = leftIndex[++leftOffset];
      }
    }
  }

  if (removes.length === 0 && inserts.length === 0) {
    return {children: next, moves: null};
  }

  return {
    children: next,
    moves: {removes: removes, inserts: inserts}
  };
}

function keyIndex(children) {
  var keys = {};
  var indices = [];
  var length = children.length;
  var counts = {};
  var index = -1;
  var child;
  var key;

  while (++index < length) {
    child = children[index];
    key = syntheticKey(child);

    if (key in counts) {
      key = key + ':' + counts[key]++;
    } else {
      counts[key] = 1;
    }

    indices[index] = key;
    keys[key] = index;
  }

  return {key: keys, index: indices};
}

function syntheticKey(node) {
  var props = {};
  var key;

  for (key in node) {
    if (ignoredKeys.indexOf(key) === -1) {
      props[key] = node[key];
    }
  }

  return node.type + ':' + JSON.stringify(props);
}

function size(node) {
  var children = node && node.children;
  var length = (children && children.length) || 0;
  var index = -1;
  var count = 0;

  while (++index < length) {
    count = count + 1 + size(children[index]);
  }

  return count;
}

function parent(value) {
  return node(value) && 'children' in value;
}

function text(value) {
  return node(value) && 'value' in value;
}

function node(value) {
  return object(value) && 'type' in value;
}
