var acorn = require('acorn')
var fs = require('fs')
var util = require('util')
var escodegen = require('escodegen')
var _ = require('lodash')
var vm = require('vm')
var estraverse = require('estraverse')


var log = function (msg, obj){
  console.log(msg + '\n', util.inspect(obj, {depth: null}))
}

var parseComments = function (comments) {
  var indentation = 0
  var parsedComments = []
  var indentedComments = []
  _.forEach(comments, function (comment) {
    if (indentation === 0) {
      // when all comments in current indentation are collected flush tem to the
      // parsed comments array
      _.forEachRight(indentedComments, function(comment) {
        parsedComments.push(comment)
      })
      indentedComments = []
    }
    var command = /@CB \s*(.+)/.exec(comment.value)
    if (command && command[1]) {
      var args = /\(\s*([^)]*?)\s*\)/.exec(command[1])
      var endTag = /\s*END\s*$/.test(command[1])
      if (args) {
        // if arg1 is defined the capture group has matched some arguments
        if (!_.isUndefined(args[1])) args = args[1].split(/\s*,\s*/)
        // otherwise the function call has no arguments
        else args = []
        var parsedComment = {
          arguments: args,
          first: {
            start: comment.start,
            end: comment.end
          },
          second: {
            start: null,
            end: null
          }
        }
        indentedComments[indentation] = parsedComment
        indentation += 1
      } else if (endTag) {
        indentation -= 1
        indentedComments[indentation].second.start = comment.start
        indentedComments[indentation].second.end = comment.end
      } else {
        console.log(comment)
        throw new Error('Error parsing annotation')
      }
    }
  })
  // flush last comment
  _.forEachRight(indentedComments, function(comment) {
    parsedComments.push(comment)
  })
  return parsedComments
}

var comments = []
var tokens = []
var opts = {
  onComment: comments,
  onToken: tokens
}
var js = fs.readFileSync(process.argv[2], {encoding: 'UTF8'})


var tree = acorn.parse(js, opts)
var parsedComments = parseComments(comments)
// log('parsedComments', parsedComments)
// log('Comments', comments)
// log('My Tree', tree)

var nodes = []
var store = []
var snips = []


while (parsedComments.length > 0) {

  var comment = parsedComments.shift()

  var snip = {
    arguments: comment.arguments,
    nodes: []
  }
  snips.push(snip)
  var newTree = estraverse.replace(tree, {
    enter: function (node, parent) {
      if (node.start > comment.first.end && node.end < comment.second.start ) {
        // delete
        log('node', node)
        snip.nodes.push(node)
        this.remove()
      }

      // function call before comment
      if (node.end === comment.first.start - 1 && node.type === 'CallExpression') {
        // log('callexpr', node)
        // store reference to node
        store.push(node)
      }
    }
  })
}



var templates = []
_.forEach(snips, function(snip) {
  var tpl = {
    type: 'FunctionExpression',
    params: _.map(snip.arguments, function (arg) {
      return {
        name: arg,
        type: 'Identifier'}
      }
    ),
    body: {
      type: 'BlockStatement',
      body: snip.nodes
    }
  }
  templates.push(tpl)
})

// log('tpl', tpl)
// log('newTree', newTree)
// log('templates', templates)
_.forEach(store, function (CallExprNode, index) {
  CallExprNode.arguments.push(templates[index])
})

// console.log(escodegen.generate(tpl))
// console.log(escodegen.generate(newTree))


// console.log('After push', util.inspect(tree.body, {depth: null})) //.arguments

var context = {
  require: require,
  console: console,
  process: process
}
vm.runInContext(escodegen.generate(newTree), vm.createContext(context))


// console.log(walker)
