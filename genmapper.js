// GenMapper
// App for mapping generations of simple churches
// https://github.com/dvopalecky/gen-mapper
// Copyright (c) 2016-2017 Daniel Vopalecky, MIT license

/* global d3, XLSX, saveAs, FileReader, template, _, Blob, boxHeight */

const appVersion = '0.2.10'
loadHTMLContent()

const margin = {top: 50, right: 30, bottom: 50, left: 30}

const zoom = d3.zoom()
  .scaleExtent([0.15, 2])
  .on('zoom', zoomed)

let projectName = 'Untitled project'

addFieldsToEditWindow(template)

d3.select('#project-name')
  .text(projectName)
  .on('click', function () {
    const userInput = window.prompt('Edit Project name', projectName).trim()
    if (userInput === '') { displayAlert("Project name can't be empty!") } else {
      projectName = userInput
      d3.select('#project-name').text(projectName)
    }
  })

setSvgHeight()
const svg = d3.select('#main-svg')
  .call(zoom)
const g = svg.append('g')
  .attr('class', 'maingroup')
const gLinks = g.append('g')
  .attr('class', 'group-links')
const gLinksText = g.append('g')
  .attr('class', 'group-links-text')
const gNodes = g.append('g')
  .attr('class', 'group-nodes')

const csvHeader = template.fields.map(field => field.header).join(',') + '\n'
const initialCsv = csvHeader + template.fields.map(field => field.initial).join(',')
let data = parseCsvData(initialCsv)
let nodes

origPosition()
redraw(template)

const alertElement = document.getElementById('alert-message')
const editGroupElement = document.getElementById('edit-group')
const editFieldElements = {}
template.fields.forEach(function (field) {
  if (field.type === 'radio') {
    field.values.forEach(function (value) {
      editFieldElements[field.header + '-' + value.header] =
          document.getElementById('edit-' + field.header + '-' + value.header)
    })
  } else if (field.type) {
    editFieldElements[field.header] = document.getElementById('edit-' + field.header)
  }
}
)
const editParentElement = document.getElementById('edit-parent')

document.addEventListener('keyup', function (e) {
  if (e.keyCode === 27) {
    if (document.getElementById('alert-message').style.display !== 'none') {
      document.getElementById('alert-message').style.display = 'none'
    } else {
      if (document.getElementById('intro').style.display !== 'none') {
        document.getElementById('intro').style.display = 'none'
      }
      if (editGroupElement.style.display !== 'none') {
        editGroupElement.style.display = 'none'
      }
    }
  } else if (e.keyCode === 13) {
    // hitting enter is like submitting changes in the edit window
    if (editGroupElement.style.display !== 'none') {
      document.getElementById('edit-submit').click()
    }
  }
})

document.getElementsByTagName('body')[0].onresize = setSvgHeight

function setSvgHeight () {
  const windowHeight = document.documentElement.clientHeight
  const leftMenuHeight = document.getElementById('left-menu').clientHeight
  const height = Math.max(windowHeight, leftMenuHeight + 10)
  d3.select('#main-svg')
    .attr('height', height)
}

function loadHTMLContent () {
  document.getElementById('left-menu').innerHTML = '<h1>GenMapper</h1>' +
  '<h2 id="project-name">&nbsp;</h2>' +
  '<p>Help</p>' +
  '<button onclick="introSwitchVisibility()">Help / About</button>' +
  '<p>Zooming</p>' +
  '<button onclick="origPosition();">Original Zoom &amp; Position</button>' +
  '<button onclick="zoomIn();">Zoom In</button>' +
  '<button onclick="zoomOut();">Zoom Out</button>' +
  '<p>Import / Export</p>' +
  '<button onclick="onLoad(\'file-input\')">Import XLXS / CSV</button>' +
  '<input type="file" id="file-input" onchange="importFile()" style="display:none;">' +
  '<button onclick="outputCsv()">Export CSV</button>' +
  '<p>Printing</p>' +
  '<button onclick="printMap(\'vertical\');">Print Vertical Multipage</button>' +
  '<button onclick="printMap(\'horizontal\');">Print Horizontal One-page</button>'

  document.getElementById('edit-group').innerHTML = '<div id="edit-group-content">' +
  '  <h1>Edit group</h1>' +
  '  <form>' +
  '    <table>' +
  '      <tr>' +
  '        <td>Parent:<td>' +
  '        <td><p id="edit-parent"></p></td>' +
  '      </tr>' +
  '    </table>' +
  '  </form>' +
  '  <div id="edit-buttons">' +
  '    <button id="edit-submit">Submit changes</button>' +
  '    <button id="edit-cancel">Cancel</button>' +
  '    <button id="edit-delete">Delete subtree</button>' +
  '    <button onclick="onLoad(\'file-input-subtree\')">Import subtree</button>' +
  '    <input type="file" id="file-input-subtree" style="display:none;">' +
  '  </div>' +
  '</div>'

  document.getElementById('alert-message').innerHTML =
  '<div id="alert-message-content">' +
  '  <p id="alert-message-text"></p>' +
  '  <button onclick="closeAlert()">OK</button>' +
  '</div>'

  document.getElementById('version').innerHTML = appVersion
}

function zoomed () {
  g.attr('transform', d3.event.transform)
}

function zoomIn () {
  zoom.scaleBy(svg, 1.2)
}

function zoomOut () {
  zoom.scaleBy(svg, 1 / 1.2)
}

function origPosition () {
  zoom.scaleTo(svg, 1)
  const origX = margin.left + (document.getElementById('main').clientWidth / 2)
  const origY = margin.top
  const parsedTransform = parseTransform(g.attr('transform'))
  zoom.translateBy(svg, origX - parsedTransform.translate[0], origY - parsedTransform.translate[1])
}

function onLoad (fileInputElementId) {
  const fileInput = document.getElementById(fileInputElementId)
  fileInput.value = ''
  fileInput.click()
}

function displayAlert (message) {
  alertElement.style.display = 'block'
  document.getElementById('alert-message-text').innerHTML = message
}

function closeAlert () {
  alertElement.style.display = null
  document.getElementById('alert-message-text').innerHTML = null
}

function introSwitchVisibility () {
  const tmp = d3.select('#intro')
  if (tmp.style('display') !== 'none') { tmp.style('display', 'none') } else { tmp.style('display', 'block') }
}

function popupEditGroupModal (d) {
  editGroupElement.style.display = 'block'

  template.fields.forEach(function (field) {
    if (field.type === 'text') {
      editFieldElements[field.header].value = d.data[field.header]
    } else if (field.type === 'radio') {
      field.values.forEach(function (value) {
        const status = (value.header === d.data[field.header])
        editFieldElements[field.header + '-' + value.header].checked = status
      })
    } else if (field.type === 'checkbox') {
      editFieldElements[field.header].checked = d.data[field.header]
    }
  }
  )
  // select first element
  editFieldElements[Object.keys(editFieldElements)[0]].select()

  editParentElement.innerHTML = d.parent ? d.parent.data.name : 'N/A'
  const groupData = d.data
  const group = d
  d3.select('#edit-submit').on('click', function () { editGroup(groupData) })
  d3.select('#edit-cancel').on('click', function () {
    editGroupElement.style.display = 'none'
  })
  d3.select('#edit-delete').on('click', function () { removeNode(group) })
  d3.select('#file-input-subtree').on('change', function () { importFileSubtree(group) })
}

function editGroup (groupData) {
  template.fields.forEach(function (field) {
    if (field.type === 'text') {
      groupData[field.header] = editFieldElements[field.header].value
    } else if (field.type === 'radio') {
      field.values.forEach(function (value) {
        if (editFieldElements[field.header + '-' + value.header].checked) {
          groupData[field.header] = value.header
        }
      })
    } else if (field.type === 'checkbox') {
      groupData[field.header] = editFieldElements[field.header].checked
    }
  }
  )

  editGroupElement.style.display = 'none'
  redraw(template)
}

function printMap (printType) {
  // calculate width and height of the map (printed rotated by 90 degrees)
  const arrNodes = nodes.descendants()
  let minX = 0
  let maxX = 0
  let minY = 0
  let maxY = 0
  for (let i = 0; i < arrNodes.length; i++) {
    const x = arrNodes[i].x
    const y = arrNodes[i].y
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  // store original values
  const origWidth = svg.attr('width')
  const origHeight = svg.attr('height')
  const origTransform = g.attr('transform')

  const totalHeight = Math.max(600, margin.top + (maxY - minY) + boxHeight + margin.top)
  const totalWidthLeft = Math.max(500, -minX + boxHeight * 1.5 / 2 + 20)
  const totalWidthRight = Math.max(500, maxX + boxHeight * 1.5 / 2 + 20)

  let translateX, translateY
  if (printType === 'horizontal') {
    const printHeight = 700
    const printWidth = 1200

    // resize for printing
    svg.attr('width', printWidth)
      .attr('height', printHeight)
    const printScale = Math.min(1, printWidth / (totalWidthLeft + totalWidthRight), printHeight / totalHeight)
    translateX = totalWidthLeft * printScale
    translateY = margin.top * printScale
    g.attr('transform', 'translate(' + translateX + ', ' + translateY + ') scale(' + printScale + ')')
  } else {
    // resize for printing
    svg.attr('width', totalHeight)
      .attr('height', totalWidthLeft + totalWidthRight)
    translateX = totalHeight - margin.top
    translateY = totalWidthLeft
    g.attr('transform', 'translate(' + translateX + ', ' + translateY + ') rotate(90)')
  }

  // change CSS for printing
  d3.select('#left-menu').style('display', 'none')
  d3.select('#main').style('float', 'left')
  d3.selectAll('#main-svg').style('background', 'white')

  window.print()

  // change CSS back after printing
  svg.attr('width', origWidth)
    .attr('height', origHeight)
  g.attr('transform', origTransform)
  d3.select('#left-menu').style('display', null)
  d3.select('#main').style('float', null)
  d3.selectAll('#main-svg').style('background', null)
}

function redraw (template) {
  // declares a tree layout and assigns the size
  const tree = d3.tree()
      .nodeSize([template.settings.nodeSize.width,
        template.settings.nodeSize.height])
      .separation(function separation (a, b) {
        return a.parent === b.parent ? 1 : 1.2
      })

  const stratifiedData = d3.stratify()(data)
  nodes = tree(stratifiedData)
  // update the links between the nodes
  const link = gLinks.selectAll('.link')
        .data(nodes.descendants().slice(1))

  link.exit()
      .remove()

  link.enter()
      .append('path')
    .merge(link)
        .attr('class', 'link')
        .attr('d', function (d) {
          return 'M' + d.x + ',' + d.y +
             'C' + d.x + ',' + (d.y + (d.parent.y + boxHeight)) / 2 +
             ' ' + d.parent.x + ',' + (d.y + (d.parent.y + boxHeight)) / 2 +
             ' ' + d.parent.x + ',' + (d.parent.y + boxHeight)
        })

  // update the link text between the nodes
  const LINK_TEXT_POSITION = 0.3 // 1 -> parent, 0 -> child
  const linkText = gLinksText.selectAll('.link-text')
        .data(nodes.descendants().slice(1))
  linkText.exit()
      .remove()
  linkText.enter()
      .append('text')
    .merge(linkText)
      .attr('class', function (d) {
        return 'link-text ' + (d.data.active ? ' link-text--active' : ' link-text--inactive')
      })
      .attr('x', function (d) { return d.x * (1 - LINK_TEXT_POSITION) + d.parent.x * LINK_TEXT_POSITION })
      .attr('y', function (d) { return d.y * (1 - LINK_TEXT_POSITION) + (d.parent.y + boxHeight) * LINK_TEXT_POSITION })
      .text(function (d) { return d.data.coach })

  // update nodes
  const node = gNodes.selectAll('.node')
        .data(nodes.descendants())

  node.exit()
      .remove()

  // NEW ELEMENTS
  const group = node.enter()
        .append('g')
        .attr('class', function (d) {
          return 'node' + (d.data.active ? ' node--active' : ' node--inactive')
        })
        .attr('transform', function (d) {
          return 'translate(' + d.x + ',' + d.y + ')'
        })
        .on('click', function (d) { popupEditGroupModal(d) })

  group.append('title').text('Edit group')
  appendRemoveButton(group)
  appendAddButton(group)

  // append SVG elements without fields
  Object.keys(template.svg).forEach(function (svgElement) {
    const svgElementValue = template.svg[svgElement]
    const element = group.append(svgElementValue['type'])
    element.attr('class', 'node-' + svgElement)
  })

  // append SVG elements related to fields
  template.fields.forEach(function (field) {
    if (field.svg) {
      const element = group.append(field.svg['type'])
      element.attr('class', 'node-' + field.header)
      Object.keys(field.svg.attributes).forEach(function (attribute) {
        element.attr(attribute, field.svg.attributes[attribute])
      })
      if (field.svg.style) {
        Object.keys(field.svg.style).forEach(function (styleKey) {
          element.style(styleKey, field.svg.style[styleKey])
        })
      }
      updateSvgForFields(field, element)
    }
  })

  // UPDATE including NEW
  const nodeWithNew = node.merge(group)
  nodeWithNew.attr('class', function (d) {
    return 'node' + (d.data.active ? ' node--active' : ' node--inactive')
  })
        .attr('transform', function (d) {
          return 'translate(' + d.x + ',' + d.y + ')'
        })
        .on('click', function (d) { popupEditGroupModal(d) })

  nodeWithNew.select('.removeNode')
      .on('click', function (d) { removeNode(d); d3.event.stopPropagation() })

  nodeWithNew.select('.addNode')
      .on('click', function (d) { addNode(d); d3.event.stopPropagation() })

  // refresh class and attributes in SVG elements without fields
  // in order to remove any additional classes or settings from inherited fields
  Object.keys(template.svg).forEach(function (svgElement) {
    const svgElementValue = template.svg[svgElement]
    const element = nodeWithNew.select('.node-' + svgElement)
      .attr('class', 'node-' + svgElement)
    Object.keys(svgElementValue.attributes).forEach(function (attribute) {
      element.attr(attribute, svgElementValue.attributes[attribute])
    })
  })

  // update node elements which have SVG in template
  template.fields.forEach(function (field) {
    if (field.svg) {
      const element = nodeWithNew.select('.node-' + field.header)
      updateSvgForFields(field, element)
    }
    if (field.inheritsFrom) {
      const element = nodeWithNew.select('.node-' + field.inheritsFrom)

      if (!element.empty()) {
        if (field.type === 'checkbox') {
          // add class to the element which the field inherits from
          if (field.class) {
            element.attr('class', function (d) {
              const checked = d.data[field.header]
              const class_ = checked ? field.class.checkedTrue : field.class.checkedFalse
              return this.classList.value + ' ' + class_
            })
          }
          if (typeof field.attributes !== 'undefined' &&
              typeof field.attributes.rx !== 'undefined') {
            element.attr('rx', function (d) {
              const checked = d.data[field.header]
              const rxObj = field.attributes.rx
              const rx = checked ? rxObj.checkedTrue : rxObj.checkedFalse
              return String(rx)
            })
          }
        }
        if (field.type === 'radio') {
          // add class to the element which the field inherits from
          element.attr('class', function (d) {
            const fieldValue = getFieldValueForRadioType(field, d)
            if (fieldValue.class) {
              return this.classList.value + ' ' + fieldValue.class
            } else {
              return this.classList.value
            }
          })
          element.attr('rx', function (d) {
            const fieldValue = getFieldValueForRadioType(field, d)
            if (typeof fieldValue.attributes !== 'undefined' &&
                typeof fieldValue.attributes.rx !== 'undefined') {
              return String(fieldValue.attributes.rx)
            } else {
              return this.rx.baseVal.valueAsString
            }
          })
        }
      }
    }
  })
}

function getFieldValueForRadioType (field, d) {
  let fieldValue = _.where(field.values, {header: d.data[field.header]})[0]
  if (typeof fieldValue === 'undefined') {
    fieldValue = _.where(field.values, {header: field.initial})[0]
  }
  return fieldValue
}

function updateSvgForFields (field, element) {
  element.text(function (d) { return d.data[field.header] })
  if (field.svg.type === 'image') {
    element.style('display', function (d) { return d.data[field.header] ? 'block' : 'none' })
  }
}

function appendRemoveButton (group) {
  const gRemoveNode = group.append('g')
      .attr('class', 'removeNode')
  gRemoveNode.append('rect')
      .attr('x', boxHeight / 2)
      .attr('y', 0)
      .attr('rx', 7)
      .attr('width', 25)
      .attr('height', boxHeight / 2)
      .append('title').text('Remove group & subtree')
  gRemoveNode.append('line') // top-left diagonal in X sign
      .attr('x1', boxHeight / 2 + 6)
      .attr('y1', boxHeight * 0.25 - 6.5)
      .attr('x2', boxHeight / 2 + 19)
      .attr('y2', boxHeight * 0.25 + 6.5)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
  gRemoveNode.append('line') // top-right diagonal in X sign
      .attr('x1', boxHeight / 2 + 19)
      .attr('y1', boxHeight * 0.25 - 6.5)
      .attr('x2', boxHeight / 2 + 6)
      .attr('y2', boxHeight * 0.25 + 6.5)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
}

function appendAddButton (group) {
  const gAddNode = group.append('g')
      .attr('class', 'addNode')
  gAddNode.append('rect')
      .attr('x', boxHeight / 2)
      .attr('y', boxHeight / 2)
      .attr('rx', 7)
      .attr('width', 25)
      .attr('height', boxHeight / 2)
      .append('title').text('Add child')
  gAddNode.append('line') // horizontal in plus sign
      .attr('x1', boxHeight / 2 + 5)
      .attr('y1', boxHeight * 0.75)
      .attr('x2', boxHeight / 2 + 20)
      .attr('y2', boxHeight * 0.75)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
  gAddNode.append('line') // vertical in plus sign
      .attr('x1', boxHeight / 2 + 12.5)
      .attr('y1', boxHeight * 0.75 - 7.5)
      .attr('x2', boxHeight / 2 + 12.5)
      .attr('y2', boxHeight * 0.75 + 7.5)
      .attr('stroke', 'white')
      .attr('stroke-width', 3)
}

function addNode (d) {
  const newNodeData = {}
  template.fields.forEach(function (field) {
    newNodeData[field.header] = field.initial
  }
  )
  newNodeData['id'] = findNewId()
  newNodeData['parentId'] = d.data.id
  data.push(newNodeData)
  redraw(template)
}

function findNewId () {
  const ids = _.map(data, function (row) { return row.id })
  return findNewIdFromArray(ids)
}

/*
 * Find smallest int >= 0 not in array
 */
function findNewIdFromArray (arr) {
  // copy and sort
  arr = arr.slice().sort(function (a, b) { return a - b })
  let tmp = 0
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= 0) { // ids must be >= 0
      if (arr[i] === tmp) {
        tmp += 1
      } else {
        break
      }
    }
  }
  return tmp
}

function removeNode (d) {
  if (!d.parent) {
    displayAlert('Sorry. Deleting root group is not possible.')
  } else {
    let confirmMessage
    if (!d.children) {
      confirmMessage = 'Do you really want to delete ' + d.data.name + '?'
    } else {
      confirmMessage = 'Do you really want to delete ' + d.data.name + ' and all descendants?'
    }
    if (window.confirm(confirmMessage)) {
      deleteAllDescendants(d)
      const nodeToDelete = _.where(data, {id: d.data.id})
      if (nodeToDelete) {
        data = _.without(data, nodeToDelete[0])
      }
    }
  }
  document.getElementById('edit-group').style.display = 'none'
  redraw(template)
}

function parseCsvData (csvData) {
  return d3.csvParse(csvData, function (d) {
    const parsedId = parseInt(d.id)
    if (parsedId < 0 || isNaN(parsedId)) { throw new Error('Group id must be integer >= 0.') }
    const parsedLine = {}
    parsedLine['id'] = parsedId
    parsedLine['parentId'] = d.parentId !== '' ? parseInt(d.parentId) : ''
    template.fields.forEach(function (field) {
      if (field.type === 'checkbox') {
        const fieldValue = d[field.header].toUpperCase()
        parsedLine[field.header] = !!['TRUE', '1'].includes(fieldValue)
      } else if (field.type) {
        parsedLine[field.header] = d[field.header]
      }
    }
    )
    return parsedLine
  })
}

function outputCsv () {
  const out = d3.csvFormatRows(data.map(function (d, i) {
    const output = []
    template.fields.forEach(function (field) {
      if (field.type === 'checkbox') {
        output.push(d[field.header] ? '1' : '0')
      } else {
        output.push(d[field.header])
      }
    }
    )
    return output
  }))
  const blob = new Blob([csvHeader + out], {type: 'text/csv;charset=utf-8'})
  const isSafari = navigator.vendor && navigator.vendor.indexOf('Apple') > -1 &&
               navigator.userAgent && !navigator.userAgent.match('CriOS')
  const promptMessage = isSafari ? 'Save as: \n(Note: Safari browser has issues with export, please see GenMapper -> Help for more info)' : 'Save as:'
  const saveName = window.prompt(promptMessage, projectName + '.csv')
  if (saveName === null) return
  saveAs(blob, saveName)
}

function parseTransform (a) {
  const b = {}
  for (let i in a = a.match(/(\w+\((-?\d+.?\d*e?-?\d*,?)+\))+/g)) {
    const c = a[i].match(/[\w.-]+/g)
    b[c.shift()] = c
  }
  return b
}

function importFile () {
  importFileFromInput('file-input', function (filedata, filename) {
    const parsedCsv = parseAndValidateCsv(filedata, filename)
    if (parsedCsv === null) { return }
    data = parsedCsv
    redraw(template)
  })
}

function importFileSubtree (d) {
  if (!window.confirm('Warning: Importing subtreee will overwrite this group (' + d.data.name + ') and all descendants. Do you want to continue?')) {
    return
  }
  importFileFromInput('file-input-subtree', function (filedata, filename) {
    const parsedCsv = parseAndValidateCsv(filedata, filename)
    if (parsedCsv === null) { return }
    csvIntoNode(d, parsedCsv)
    redraw(template)
    editGroupElement.style.display = 'none'
  })
}

/**
 * If error occurs, displays error and returns null
 * If not, raises error
 */
function parseAndValidateCsv (filedata, filename) {
  try {
    const csvString = fileToCsvString(filedata, filename)
    const parsedCsv = parseCsvData(csvString)
    validTree(parsedCsv)
    return parsedCsv
  } catch (err) {
    displayImportError(err)
    return null
  }
}

/**
 * Checks if parsedCsv creates a valid tree.
 * If not, raises error
 */
function validTree (parsedCsv) {
  const treeTest = d3.tree()
  const stratifiedDataTest = d3.stratify()(parsedCsv)
  treeTest(stratifiedDataTest)
}

function displayImportError (err) {
  if (err.toString().includes('>= 0.') || err.toString().includes('Wrong type')) {
    displayAlert('Error when importing file. <br>' + err.toString())
  } else {
    displayAlert('Error when importing file.<br><br>Please check that the file is in correct format' +
          '(comma separated values), that the root group has no parent, and that all other' +
          'relationships make a valid tree.<br><br>Also check that you use the correct version of the App.')
  }
}

function deleteAllDescendants (d) {
  let idsToDelete = _.map(d.children, function (row) { return parseInt(row.id) })
  while (idsToDelete.length > 0) {
    const currentId = idsToDelete.pop()
    const childrenIdsToDelete = _.map(_.where(data, {parentId: currentId}),
      function (row) { return row.id })
    idsToDelete = idsToDelete.concat(childrenIdsToDelete)
    const nodeToDelete = _.where(data, {id: currentId})
    if (nodeToDelete) { data = _.without(data, nodeToDelete[0]) }
  }
}

function csvIntoNode (d, parsedCsv) {
  deleteAllDescendants(d)

  // replace node by root of imported
  const nodeToDelete = _.where(data, {id: d.data.id})[0]
  const rowRootOfImported = _.where(parsedCsv, {parentId: ''})[0]
  const mapOldIdToNewId = {}
  mapOldIdToNewId[rowRootOfImported.id] = nodeToDelete.id
  parsedCsv = _.without(parsedCsv, rowRootOfImported)
  rowRootOfImported.id = nodeToDelete.id
  rowRootOfImported.parentId = nodeToDelete.parentId
  data[_.indexOf(data, nodeToDelete)] = rowRootOfImported

  const idsUnsorted = _.map(data, function (row) { return row.id })
  const ids = idsUnsorted.sort(function (a, b) { return a - b })
  // update ids of other nodes and push into data
  while (parsedCsv.length > 0) {
    const row = parsedCsv.pop()
    if (!(row.id in mapOldIdToNewId)) {
      const newId = findNewIdFromArray(ids)
      mapOldIdToNewId[row.id] = newId
      ids.push(newId)
    }
    if (!(row.parentId in mapOldIdToNewId)) {
      const newId = findNewIdFromArray(ids)
      mapOldIdToNewId[row.parentId] = newId
      ids.push(newId)
    }
    // change id and parentId
    row.id = mapOldIdToNewId[row.id]
    row.parentId = mapOldIdToNewId[row.parentId]
    data.push(row)
  }
}

function importFileFromInput (fileInputElementId, callback) {
  if (typeof window.FileReader !== 'function') {
    displayAlert("The file API isn't supported on this browser yet.")
    return
  }

  const input = document.getElementById(fileInputElementId)
  if (!input) {
    displayAlert("Um, couldn't find the fileinput element.")
  } else if (!input.files) {
    displayAlert("This browser doesn't seem to support the 'files' property of file inputs.")
  } else if (!input.files[0]) {
    displayAlert('Please select a file')
  } else {
    const file = input.files[0]
    const filename = file.name
    const fr = new FileReader()
    fr.onload = function () {
      const filedata = fr.result
      callback(filedata, filename)
    }
    const extension = /(?:\.([^.]+))?$/.exec(filename)[1]
    if (extension === 'csv') {
      fr.readAsText(file)
    } else {
      fr.readAsBinaryString(file)
    }
  }
}

function fileToCsvString (filedata, filename) {
  const regex = /(?:\.([^.]+))?$/
  const extension = regex.exec(filename)[1].toLowerCase()
  let csvString

  if (extension === 'xls' || extension === 'xlsx') {
    const workbook = XLSX.read(filedata, {type: 'binary'})
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    csvString = XLSX.utils.sheet_to_csv(worksheet)
  } else if (extension === 'csv') {
    csvString = filedata
  } else {
    throw new Error('Wrong type of file. Please import xls, xlsx or csv files.')
  }
  csvString = csvString.replace(/\r\n?/g, '\n')
  // replace first line with a default one
  return csvHeader + csvString.substring(csvString.indexOf('\n') + 1)
}

function addFieldsToEditWindow (template) {
  template.fields.forEach(function (field) {
    if (field.type) {
      const tr = d3.select('#edit-group-content')
          .select('form')
          .select('table')
          .append('tr')
      tr.append('td')
          .text(field.description + ':')
      const td = tr.append('td')
      if (field.type === 'radio') {
        for (let value of field.values) {
          td.append('input')
              .attr('type', field.type)
              .attr('name', field.header)
              .attr('value', value.header)
              .attr('id', 'edit-' + field.header + '-' + value.header)
          td.append('span')
              .html(value.description)
          td.append('br')
        }
      } else {
        td.append('input')
            .attr('type', field.type)
            .attr('name', field.header)
            .attr('name', field.header)
            .attr('id', 'edit-' + field.header)
      }
    }
  }
  )
}
