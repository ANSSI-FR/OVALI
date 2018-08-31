(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.vis = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

exports.DataSet = require('./lib/DataSet');
exports.Network = require('./lib/network/Network');
exports.Configurator = require('./lib/shared/Configurator');

},{"./lib/DataSet":2,"./lib/network/Network":10,"./lib/shared/Configurator":71}],2:[function(require,module,exports){
'use strict';

var util = require('./util');
var Queue = require('./Queue');

/**
 * DataSet
 *
 * Usage:
 *     var dataSet = new DataSet({
 *         fieldId: '_id',
 *         type: {
 *             // ...
 *         }
 *     });
 *
 *     dataSet.add(item);
 *     dataSet.add(data);
 *     dataSet.update(item);
 *     dataSet.update(data);
 *     dataSet.remove(id);
 *     dataSet.remove(ids);
 *     var data = dataSet.get();
 *     var data = dataSet.get(id);
 *     var data = dataSet.get(ids);
 *     var data = dataSet.get(ids, options, data);
 *     dataSet.clear();
 *
 * A data set can:
 * - add/remove/update data
 * - gives triggers upon changes in the data
 * - can  import/export data in various data formats
 *
 * @param {Array} [data]    Optional array with initial data
 * @param {Object} [options]   Available options:
 *                             {String} fieldId Field name of the id in the
 *                                              items, 'id' by default.
 *                             {Object.<String, String} type
 *                                              A map with field names as key,
 *                                              and the field type as value.
 *                             {Object} queue   Queue changes to the DataSet,
 *                                              flush them all at once.
 *                                              Queue options:
 *                                              - {number} delay  Delay in ms, null by default
 *                                              - {number} max    Maximum number of entries in the queue, Infinity by default
 * @constructor DataSet
 */
// TODO: add a DataSet constructor DataSet(data, options)
function DataSet(data, options) {
  // correctly read optional arguments
  if (data && !Array.isArray(data)) {
    options = data;
    data = null;
  }

  this._options = options || {};
  this._data = {}; // map with data indexed by id
  this.length = 0; // number of items in the DataSet
  this._fieldId = this._options.fieldId || 'id'; // name of the field containing id
  this._type = {}; // internal field types (NOTE: this can differ from this._options.type)

  // all variants of a Date are internally stored as Date, so we can convert
  // from everything to everything (also from ISODate to Number for example)
  if (this._options.type) {
    var fields = Object.keys(this._options.type);
    for (var i = 0, len = fields.length; i < len; i++) {
      var field = fields[i];
      var value = this._options.type[field];
      if (value == 'Date' || value == 'ISODate' || value == 'ASPDate') {
        this._type[field] = 'Date';
      } else {
        this._type[field] = value;
      }
    }
  }

  // TODO: deprecated since version 1.1.1 (or 2.0.0?)
  if (this._options.convert) {
    throw new Error('Option "convert" is deprecated. Use "type" instead.');
  }

  this._subscribers = {}; // event subscribers

  // add initial data when provided
  if (data) {
    this.add(data);
  }

  this.setOptions(options);
}

/**
 * @param {Object} [options]   Available options:
 *                             {Object} queue   Queue changes to the DataSet,
 *                                              flush them all at once.
 *                                              Queue options:
 *                                              - {number} delay  Delay in ms, null by default
 *                                              - {number} max    Maximum number of entries in the queue, Infinity by default
 * @param options
 */
DataSet.prototype.setOptions = function (options) {
  if (options && options.queue !== undefined) {
    if (options.queue === false) {
      // delete queue if loaded
      if (this._queue) {
        this._queue.destroy();
        delete this._queue;
      }
    } else {
      // create queue and update its options
      if (!this._queue) {
        this._queue = Queue.extend(this, {
          replace: ['add', 'update', 'remove']
        });
      }

      if (typeof options.queue === 'object') {
        this._queue.setOptions(options.queue);
      }
    }
  }
};

/**
 * Subscribe to an event, add an event listener
 * @param {String} event        Event name. Available events: 'put', 'update',
 *                              'remove'
 * @param {function} callback   Callback method. Called with three parameters:
 *                                  {String} event
 *                                  {Object | null} params
 *                                  {String | Number} senderId
 */
DataSet.prototype.on = function (event, callback) {
  var subscribers = this._subscribers[event];
  if (!subscribers) {
    subscribers = [];
    this._subscribers[event] = subscribers;
  }

  subscribers.push({
    callback: callback
  });
};

// TODO: remove this deprecated function some day (replaced with `on` since version 0.5, deprecated since v4.0)
DataSet.prototype.subscribe = function () {
  throw new Error('DataSet.subscribe is deprecated. Use DataSet.on instead.');
};

/**
 * Unsubscribe from an event, remove an event listener
 * @param {String} event
 * @param {function} callback
 */
DataSet.prototype.off = function (event, callback) {
  var subscribers = this._subscribers[event];
  if (subscribers) {
    this._subscribers[event] = subscribers.filter(function (listener) {
      return listener.callback != callback;
    });
  }
};

// TODO: remove this deprecated function some day (replaced with `on` since version 0.5, deprecated since v4.0)
DataSet.prototype.unsubscribe = function () {
  throw new Error('DataSet.unsubscribe is deprecated. Use DataSet.off instead.');
};

/**
 * Trigger an event
 * @param {String} event
 * @param {Object | null} params
 * @param {String} [senderId]       Optional id of the sender.
 * @private
 */
DataSet.prototype._trigger = function (event, params, senderId) {
  if (event == '*') {
    throw new Error('Cannot trigger event *');
  }

  var subscribers = [];
  if (event in this._subscribers) {
    subscribers = subscribers.concat(this._subscribers[event]);
  }
  if ('*' in this._subscribers) {
    subscribers = subscribers.concat(this._subscribers['*']);
  }

  for (var i = 0, len = subscribers.length; i < len; i++) {
    var subscriber = subscribers[i];
    if (subscriber.callback) {
      subscriber.callback(event, params, senderId || null);
    }
  }
};

/**
 * Add data.
 * Adding an item will fail when there already is an item with the same id.
 * @param {Object | Array} data
 * @param {String} [senderId] Optional sender id
 * @return {Array} addedIds      Array with the ids of the added items
 */
DataSet.prototype.add = function (data, senderId) {
  var addedIds = [],
      id,
      me = this;

  if (Array.isArray(data)) {
    // Array
    for (var i = 0, len = data.length; i < len; i++) {
      id = me._addItem(data[i]);
      addedIds.push(id);
    }
  } else if (data instanceof Object) {
    // Single item
    id = me._addItem(data);
    addedIds.push(id);
  } else {
    throw new Error('Unknown dataType');
  }

  if (addedIds.length) {
    this._trigger('add', { items: addedIds }, senderId);
  }

  return addedIds;
};

/**
 * Update existing items. When an item does not exist, it will be created
 * @param {Object | Array} data
 * @param {String} [senderId] Optional sender id
 * @return {Array} updatedIds     The ids of the added or updated items
 */
DataSet.prototype.update = function (data, senderId) {
  var addedIds = [];
  var updatedIds = [];
  var oldData = [];
  var updatedData = [];
  var me = this;
  var fieldId = me._fieldId;

  var addOrUpdate = function addOrUpdate(item) {
    var id = item[fieldId];
    if (me._data[id]) {
      var oldItem = util.extend({}, me._data[id]);
      // update item
      id = me._updateItem(item);
      updatedIds.push(id);
      updatedData.push(item);
      oldData.push(oldItem);
    } else {
      // add new item
      id = me._addItem(item);
      addedIds.push(id);
    }
  };

  if (Array.isArray(data)) {
    // Array
    for (var i = 0, len = data.length; i < len; i++) {
      if (data[i] instanceof Object) {
        addOrUpdate(data[i]);
      } else {
        console.warn("Ignoring input item, which is not an object at index" + i);
      }
    }
  } else if (data instanceof Object) {
    // Single item
    addOrUpdate(data);
  } else {
    throw new Error('Unknown dataType');
  }

  if (addedIds.length) {
    this._trigger('add', { items: addedIds }, senderId);
  }
  if (updatedIds.length) {
    var props = { items: updatedIds, oldData: oldData, data: updatedData };
    // TODO: remove deprecated property 'data' some day
    //Object.defineProperty(props, 'data', {
    //  'get': (function() {
    //    console.warn('Property data is deprecated. Use DataSet.get(ids) to retrieve the new data, use the oldData property on this object to get the old data');
    //    return updatedData;
    //  }).bind(this)
    //});
    this._trigger('update', props, senderId);
  }

  return addedIds.concat(updatedIds);
};

/**
 * Get a data item or multiple items.
 *
 * Usage:
 *
 *     get()
 *     get(options: Object)
 *
 *     get(id: Number | String)
 *     get(id: Number | String, options: Object)
 *
 *     get(ids: Number[] | String[])
 *     get(ids: Number[] | String[], options: Object)
 *
 * Where:
 *
 * {Number | String} id         The id of an item
 * {Number[] | String{}} ids    An array with ids of items
 * {Object} options             An Object with options. Available options:
 * {String} [returnType]        Type of data to be returned.
 *                              Can be 'Array' (default) or 'Object'.
 * {Object.<String, String>} [type]
 * {String[]} [fields]          field names to be returned
 * {function} [filter]          filter items
 * {String | function} [order]  Order the items by a field name or custom sort function.
 * @throws Error
 */
DataSet.prototype.get = function (args) {
  var me = this;

  // parse the arguments
  var id, ids, options;
  var firstType = util.getType(arguments[0]);
  if (firstType == 'String' || firstType == 'Number') {
    // get(id [, options])
    id = arguments[0];
    options = arguments[1];
  } else if (firstType == 'Array') {
    // get(ids [, options])
    ids = arguments[0];
    options = arguments[1];
  } else {
    // get([, options])
    options = arguments[0];
  }

  // determine the return type
  var returnType;
  if (options && options.returnType) {
    var allowedValues = ['Array', 'Object'];
    returnType = allowedValues.indexOf(options.returnType) == -1 ? 'Array' : options.returnType;
  } else {
    returnType = 'Array';
  }

  // build options
  var type = options && options.type || this._options.type;
  var filter = options && options.filter;
  var items = [],
      item,
      itemIds,
      itemId,
      i,
      len;

  // convert items
  if (id != undefined) {
    // return a single item
    item = me._getItem(id, type);
    if (item && filter && !filter(item)) {
      item = null;
    }
  } else if (ids != undefined) {
    // return a subset of items
    for (i = 0, len = ids.length; i < len; i++) {
      item = me._getItem(ids[i], type);
      if (!filter || filter(item)) {
        items.push(item);
      }
    }
  } else {
    // return all items
    itemIds = Object.keys(this._data);
    for (i = 0, len = itemIds.length; i < len; i++) {
      itemId = itemIds[i];
      item = me._getItem(itemId, type);
      if (!filter || filter(item)) {
        items.push(item);
      }
    }
  }

  // order the results
  if (options && options.order && id == undefined) {
    this._sort(items, options.order);
  }

  // filter fields of the items
  if (options && options.fields) {
    var fields = options.fields;
    if (id != undefined) {
      item = this._filterFields(item, fields);
    } else {
      for (i = 0, len = items.length; i < len; i++) {
        items[i] = this._filterFields(items[i], fields);
      }
    }
  }

  // return the results
  if (returnType == 'Object') {
    var result = {},
        resultant;
    for (i = 0, len = items.length; i < len; i++) {
      resultant = items[i];
      result[resultant.id] = resultant;
    }
    return result;
  } else {
    if (id != undefined) {
      // a single item
      return item;
    } else {
      // just return our array
      return items;
    }
  }
};

/**
 * Get ids of all items or from a filtered set of items.
 * @param {Object} [options]    An Object with options. Available options:
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Array} ids
 */
DataSet.prototype.getIds = function (options) {
  var data = this._data,
      filter = options && options.filter,
      order = options && options.order,
      type = options && options.type || this._options.type,
      itemIds = Object.keys(data),
      i,
      len,
      id,
      item,
      items,
      ids = [];

  if (filter) {
    // get filtered items
    if (order) {
      // create ordered list
      items = [];
      for (i = 0, len = itemIds.length; i < len; i++) {
        id = itemIds[i];
        item = this._getItem(id, type);
        if (filter(item)) {
          items.push(item);
        }
      }

      this._sort(items, order);

      for (i = 0, len = items.length; i < len; i++) {
        ids.push(items[i][this._fieldId]);
      }
    } else {
      // create unordered list
      for (i = 0, len = itemIds.length; i < len; i++) {
        id = itemIds[i];
        item = this._getItem(id, type);
        if (filter(item)) {
          ids.push(item[this._fieldId]);
        }
      }
    }
  } else {
    // get all items
    if (order) {
      // create an ordered list
      items = [];
      for (i = 0, len = itemIds.length; i < len; i++) {
        id = itemIds[i];
        items.push(data[id]);
      }

      this._sort(items, order);

      for (i = 0, len = items.length; i < len; i++) {
        ids.push(items[i][this._fieldId]);
      }
    } else {
      // create unordered list
      for (i = 0, len = itemIds.length; i < len; i++) {
        id = itemIds[i];
        item = data[id];
        ids.push(item[this._fieldId]);
      }
    }
  }

  return ids;
};

/**
 * Returns the DataSet itself. Is overwritten for example by the DataView,
 * which returns the DataSet it is connected to instead.
 */
DataSet.prototype.getDataSet = function () {
  return this;
};

/**
 * Execute a callback function for every item in the dataset.
 * @param {function} callback
 * @param {Object} [options]    Available options:
 *                              {Object.<String, String>} [type]
 *                              {String[]} [fields] filter fields
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 */
DataSet.prototype.forEach = function (callback, options) {
  var filter = options && options.filter,
      type = options && options.type || this._options.type,
      data = this._data,
      itemIds = Object.keys(data),
      i,
      len,
      item,
      id;

  if (options && options.order) {
    // execute forEach on ordered list
    var items = this.get(options);

    for (i = 0, len = items.length; i < len; i++) {
      item = items[i];
      id = item[this._fieldId];
      callback(item, id);
    }
  } else {
    // unordered
    for (i = 0, len = itemIds.length; i < len; i++) {
      id = itemIds[i];
      item = this._getItem(id, type);
      if (!filter || filter(item)) {
        callback(item, id);
      }
    }
  }
};

/**
 * Map every item in the dataset.
 * @param {function} callback
 * @param {Object} [options]    Available options:
 *                              {Object.<String, String>} [type]
 *                              {String[]} [fields] filter fields
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Object[]} mappedItems
 */
DataSet.prototype.map = function (callback, options) {
  var filter = options && options.filter,
      type = options && options.type || this._options.type,
      mappedItems = [],
      data = this._data,
      itemIds = Object.keys(data),
      i,
      len,
      id,
      item;

  // convert and filter items
  for (i = 0, len = itemIds.length; i < len; i++) {
    id = itemIds[i];
    item = this._getItem(id, type);
    if (!filter || filter(item)) {
      mappedItems.push(callback(item, id));
    }
  }

  // order items
  if (options && options.order) {
    this._sort(mappedItems, options.order);
  }

  return mappedItems;
};

/**
 * Filter the fields of an item
 * @param {Object | null} item
 * @param {String[]} fields     Field names
 * @return {Object | null} filteredItem or null if no item is provided
 * @private
 */
DataSet.prototype._filterFields = function (item, fields) {
  if (!item) {
    // item is null
    return item;
  }

  var filteredItem = {},
      itemFields = Object.keys(item),
      len = itemFields.length,
      i,
      field;

  if (Array.isArray(fields)) {
    for (i = 0; i < len; i++) {
      field = itemFields[i];
      if (fields.indexOf(field) != -1) {
        filteredItem[field] = item[field];
      }
    }
  } else {
    for (i = 0; i < len; i++) {
      field = itemFields[i];
      if (fields.hasOwnProperty(field)) {
        filteredItem[fields[field]] = item[field];
      }
    }
  }

  return filteredItem;
};

/**
 * Sort the provided array with items
 * @param {Object[]} items
 * @param {String | function} order      A field name or custom sort function.
 * @private
 */
DataSet.prototype._sort = function (items, order) {
  if (util.isString(order)) {
    // order by provided field name
    var name = order; // field name
    items.sort(function (a, b) {
      var av = a[name];
      var bv = b[name];
      return av > bv ? 1 : av < bv ? -1 : 0;
    });
  } else if (typeof order === 'function') {
    // order by sort function
    items.sort(order);
  }
  // TODO: extend order by an Object {field:String, direction:String}
  //       where direction can be 'asc' or 'desc'
  else {
      throw new TypeError('Order must be a function or a string');
    }
};

/**
 * Remove an object by pointer or by id
 * @param {String | Number | Object | Array} id Object or id, or an array with
 *                                              objects or ids to be removed
 * @param {String} [senderId] Optional sender id
 * @return {Array} removedIds
 */
DataSet.prototype.remove = function (id, senderId) {
  var removedIds = [],
      i,
      len,
      removedId;

  if (Array.isArray(id)) {
    for (i = 0, len = id.length; i < len; i++) {
      removedId = this._remove(id[i]);
      if (removedId != null) {
        removedIds.push(removedId);
      }
    }
  } else {
    removedId = this._remove(id);
    if (removedId != null) {
      removedIds.push(removedId);
    }
  }

  if (removedIds.length) {
    this._trigger('remove', { items: removedIds }, senderId);
  }

  return removedIds;
};

/**
 * Remove an item by its id
 * @param {Number | String | Object} id   id or item
 * @returns {Number | String | null} id
 * @private
 */
DataSet.prototype._remove = function (id) {
  if (util.isNumber(id) || util.isString(id)) {
    if (this._data[id]) {
      delete this._data[id];
      this.length--;
      return id;
    }
  } else if (id instanceof Object) {
    var itemId = id[this._fieldId];
    if (itemId !== undefined && this._data[itemId]) {
      delete this._data[itemId];
      this.length--;
      return itemId;
    }
  }
  return null;
};

/**
 * Clear the data
 * @param {String} [senderId] Optional sender id
 * @return {Array} removedIds    The ids of all removed items
 */
DataSet.prototype.clear = function (senderId) {
  var ids = Object.keys(this._data);

  this._data = {};
  this.length = 0;

  this._trigger('remove', { items: ids }, senderId);

  return ids;
};

/**
 * Find the item with maximum value of a specified field
 * @param {String} field
 * @return {Object | null} item  Item containing max value, or null if no items
 */
DataSet.prototype.max = function (field) {
  var data = this._data,
      itemIds = Object.keys(data),
      max = null,
      maxField = null,
      i,
      len;

  for (i = 0, len = itemIds.length; i < len; i++) {
    var id = itemIds[i];
    var item = data[id];
    var itemField = item[field];
    if (itemField != null && (!max || itemField > maxField)) {
      max = item;
      maxField = itemField;
    }
  }

  return max;
};

/**
 * Find the item with minimum value of a specified field
 * @param {String} field
 * @return {Object | null} item  Item containing max value, or null if no items
 */
DataSet.prototype.min = function (field) {
  var data = this._data,
      itemIds = Object.keys(data),
      min = null,
      minField = null,
      i,
      len;

  for (i = 0, len = itemIds.length; i < len; i++) {
    var id = itemIds[i];
    var item = data[id];
    var itemField = item[field];
    if (itemField != null && (!min || itemField < minField)) {
      min = item;
      minField = itemField;
    }
  }

  return min;
};

/**
 * Find all distinct values of a specified field
 * @param {String} field
 * @return {Array} values  Array containing all distinct values. If data items
 *                         do not contain the specified field are ignored.
 *                         The returned array is unordered.
 */
DataSet.prototype.distinct = function (field) {
  var data = this._data;
  var itemIds = Object.keys(data);
  var values = [];
  var fieldType = this._options.type && this._options.type[field] || null;
  var count = 0;
  var i, j, len;

  for (i = 0, len = itemIds.length; i < len; i++) {
    var id = itemIds[i];
    var item = data[id];
    var value = item[field];
    var exists = false;
    for (j = 0; j < count; j++) {
      if (values[j] == value) {
        exists = true;
        break;
      }
    }
    if (!exists && value !== undefined) {
      values[count] = value;
      count++;
    }
  }

  if (fieldType) {
    for (i = 0, len = values.length; i < len; i++) {
      values[i] = util.convert(values[i], fieldType);
    }
  }

  return values;
};

/**
 * Add a single item. Will fail when an item with the same id already exists.
 * @param {Object} item
 * @return {String} id
 * @private
 */
DataSet.prototype._addItem = function (item) {
  var id = item[this._fieldId];

  if (id != undefined) {
    // check whether this id is already taken
    if (this._data[id]) {
      // item already exists
      throw new Error('Cannot add item: item with id ' + id + ' already exists');
    }
  } else {
    // generate an id
    id = util.randomUUID();
    item[this._fieldId] = id;
  }

  var d = {},
      fields = Object.keys(item),
      i,
      len;
  for (i = 0, len = fields.length; i < len; i++) {
    var field = fields[i];
    var fieldType = this._type[field]; // type may be undefined
    d[field] = util.convert(item[field], fieldType);
  }
  this._data[id] = d;
  this.length++;

  return id;
};

/**
 * Get an item. Fields can be converted to a specific type
 * @param {String} id
 * @param {Object.<String, String>} [types]  field types to convert
 * @return {Object | null} item
 * @private
 */
DataSet.prototype._getItem = function (id, types) {
  var field, value, i, len;

  // get the item from the dataset
  var raw = this._data[id];
  if (!raw) {
    return null;
  }

  // convert the items field types
  var converted = {},
      fields = Object.keys(raw);

  if (types) {
    for (i = 0, len = fields.length; i < len; i++) {
      field = fields[i];
      value = raw[field];
      converted[field] = util.convert(value, types[field]);
    }
  } else {
    // no field types specified, no converting needed
    for (i = 0, len = fields.length; i < len; i++) {
      field = fields[i];
      value = raw[field];
      converted[field] = value;
    }
  }
  return converted;
};

/**
 * Update a single item: merge with existing item.
 * Will fail when the item has no id, or when there does not exist an item
 * with the same id.
 * @param {Object} item
 * @return {String} id
 * @private
 */
DataSet.prototype._updateItem = function (item) {
  var id = item[this._fieldId];
  if (id == undefined) {
    throw new Error('Cannot update item: item has no id (item: ' + JSON.stringify(item) + ')');
  }
  var d = this._data[id];
  if (!d) {
    // item doesn't exist
    throw new Error('Cannot update item: no item with id ' + id + ' found');
  }

  // merge with current item
  var fields = Object.keys(item);
  for (var i = 0, len = fields.length; i < len; i++) {
    var field = fields[i];
    var fieldType = this._type[field]; // type may be undefined
    d[field] = util.convert(item[field], fieldType);
  }

  return id;
};

module.exports = DataSet;

},{"./Queue":4,"./util":73}],3:[function(require,module,exports){
'use strict';

var util = require('./util');
var DataSet = require('./DataSet');

/**
 * DataView
 *
 * a dataview offers a filtered view on a dataset or an other dataview.
 *
 * @param {DataSet | DataView} data
 * @param {Object} [options]   Available options: see method get
 *
 * @constructor DataView
 */
function DataView(data, options) {
  this._data = null;
  this._ids = {}; // ids of the items currently in memory (just contains a boolean true)
  this.length = 0; // number of items in the DataView
  this._options = options || {};
  this._fieldId = 'id'; // name of the field containing id
  this._subscribers = {}; // event subscribers

  var me = this;
  this.listener = function () {
    me._onEvent.apply(me, arguments);
  };

  this.setData(data);
}

// TODO: implement a function .config() to dynamically update things like configured filter
// and trigger changes accordingly

/**
 * Set a data source for the view
 * @param {DataSet | DataView} data
 */
DataView.prototype.setData = function (data) {
  var ids, id, i, len;

  if (this._data) {
    // unsubscribe from current dataset
    if (this._data.off) {
      this._data.off('*', this.listener);
    }

    // trigger a remove of all items in memory
    ids = Object.keys(this._ids);
    this._ids = {};
    this.length = 0;
    this._trigger('remove', { items: ids });
  }

  this._data = data;

  if (this._data) {
    // update fieldId
    this._fieldId = this._options.fieldId || this._data && this._data.options && this._data.options.fieldId || 'id';

    // trigger an add of all added items
    ids = this._data.getIds({ filter: this._options && this._options.filter });
    for (i = 0, len = ids.length; i < len; i++) {
      id = ids[i];
      this._ids[id] = true;
    }
    this.length = ids.length;
    this._trigger('add', { items: ids });

    // subscribe to new dataset
    if (this._data.on) {
      this._data.on('*', this.listener);
    }
  }
};

/**
 * Refresh the DataView. Useful when the DataView has a filter function
 * containing a variable parameter.
 */
DataView.prototype.refresh = function () {
  var id, i, len;
  var ids = this._data.getIds({ filter: this._options && this._options.filter });
  var oldIds = Object.keys(this._ids);
  var newIds = {};
  var added = [];
  var removed = [];

  // check for additions
  for (i = 0, len = ids.length; i < len; i++) {
    id = ids[i];
    newIds[id] = true;
    if (!this._ids[id]) {
      added.push(id);
      this._ids[id] = true;
    }
  }

  // check for removals
  for (i = 0, len = oldIds.length; i < len; i++) {
    id = oldIds[i];
    if (!newIds[id]) {
      removed.push(id);
      delete this._ids[id];
    }
  }

  this.length += added.length - removed.length;

  // trigger events
  if (added.length) {
    this._trigger('add', { items: added });
  }
  if (removed.length) {
    this._trigger('remove', { items: removed });
  }
};

/**
 * Get data from the data view
 *
 * Usage:
 *
 *     get()
 *     get(options: Object)
 *     get(options: Object, data: Array | DataTable)
 *
 *     get(id: Number)
 *     get(id: Number, options: Object)
 *     get(id: Number, options: Object, data: Array | DataTable)
 *
 *     get(ids: Number[])
 *     get(ids: Number[], options: Object)
 *     get(ids: Number[], options: Object, data: Array | DataTable)
 *
 * Where:
 *
 * {Number | String} id         The id of an item
 * {Number[] | String{}} ids    An array with ids of items
 * {Object} options             An Object with options. Available options:
 *                              {String} [type] Type of data to be returned. Can
 *                                              be 'DataTable' or 'Array' (default)
 *                              {Object.<String, String>} [convert]
 *                              {String[]} [fields] field names to be returned
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * {Array | DataTable} [data]   If provided, items will be appended to this
 *                              array or table. Required in case of Google
 *                              DataTable.
 * @param args
 */
DataView.prototype.get = function (args) {
  var me = this;

  // parse the arguments
  var ids, options, data;
  var firstType = util.getType(arguments[0]);
  if (firstType == 'String' || firstType == 'Number' || firstType == 'Array') {
    // get(id(s) [, options] [, data])
    ids = arguments[0]; // can be a single id or an array with ids
    options = arguments[1];
    data = arguments[2];
  } else {
    // get([, options] [, data])
    options = arguments[0];
    data = arguments[1];
  }

  // extend the options with the default options and provided options
  var viewOptions = util.extend({}, this._options, options);

  // create a combined filter method when needed
  if (this._options.filter && options && options.filter) {
    viewOptions.filter = function (item) {
      return me._options.filter(item) && options.filter(item);
    };
  }

  // build up the call to the linked data set
  var getArguments = [];
  if (ids != undefined) {
    getArguments.push(ids);
  }
  getArguments.push(viewOptions);
  getArguments.push(data);

  return this._data && this._data.get.apply(this._data, getArguments);
};

/**
 * Get ids of all items or from a filtered set of items.
 * @param {Object} [options]    An Object with options. Available options:
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Array} ids
 */
DataView.prototype.getIds = function (options) {
  var ids;

  if (this._data) {
    var defaultFilter = this._options.filter;
    var filter;

    if (options && options.filter) {
      if (defaultFilter) {
        filter = function (item) {
          return defaultFilter(item) && options.filter(item);
        };
      } else {
        filter = options.filter;
      }
    } else {
      filter = defaultFilter;
    }

    ids = this._data.getIds({
      filter: filter,
      order: options && options.order
    });
  } else {
    ids = [];
  }

  return ids;
};

/**
 * Map every item in the dataset.
 * @param {function} callback
 * @param {Object} [options]    Available options:
 *                              {Object.<String, String>} [type]
 *                              {String[]} [fields] filter fields
 *                              {function} [filter] filter items
 *                              {String | function} [order] Order the items by
 *                                  a field name or custom sort function.
 * @return {Object[]} mappedItems
 */
DataView.prototype.map = function (callback, options) {
  var mappedItems = [];
  if (this._data) {
    var defaultFilter = this._options.filter;
    var filter;

    if (options && options.filter) {
      if (defaultFilter) {
        filter = function (item) {
          return defaultFilter(item) && options.filter(item);
        };
      } else {
        filter = options.filter;
      }
    } else {
      filter = defaultFilter;
    }

    mappedItems = this._data.map(callback, {
      filter: filter,
      order: options && options.order
    });
  } else {
    mappedItems = [];
  }

  return mappedItems;
};

/**
 * Get the DataSet to which this DataView is connected. In case there is a chain
 * of multiple DataViews, the root DataSet of this chain is returned.
 * @return {DataSet} dataSet
 */
DataView.prototype.getDataSet = function () {
  var dataSet = this;
  while (dataSet instanceof DataView) {
    dataSet = dataSet._data;
  }
  return dataSet || null;
};

/**
 * Event listener. Will propagate all events from the connected data set to
 * the subscribers of the DataView, but will filter the items and only trigger
 * when there are changes in the filtered data set.
 * @param {String} event
 * @param {Object | null} params
 * @param {String} senderId
 * @private
 */
DataView.prototype._onEvent = function (event, params, senderId) {
  var i, len, id, item;
  var ids = params && params.items;
  var data = this._data;
  var updatedData = [];
  var added = [];
  var updated = [];
  var removed = [];

  if (ids && data) {
    switch (event) {
      case 'add':
        // filter the ids of the added items
        for (i = 0, len = ids.length; i < len; i++) {
          id = ids[i];
          item = this.get(id);
          if (item) {
            this._ids[id] = true;
            added.push(id);
          }
        }

        break;

      case 'update':
        // determine the event from the views viewpoint: an updated
        // item can be added, updated, or removed from this view.
        for (i = 0, len = ids.length; i < len; i++) {
          id = ids[i];
          item = this.get(id);

          if (item) {
            if (this._ids[id]) {
              updated.push(id);
              updatedData.push(params.data[i]);
            } else {
              this._ids[id] = true;
              added.push(id);
            }
          } else {
            if (this._ids[id]) {
              delete this._ids[id];
              removed.push(id);
            } else {
              // nothing interesting for me :-(
            }
          }
        }

        break;

      case 'remove':
        // filter the ids of the removed items
        for (i = 0, len = ids.length; i < len; i++) {
          id = ids[i];
          if (this._ids[id]) {
            delete this._ids[id];
            removed.push(id);
          }
        }

        break;
    }

    this.length += added.length - removed.length;

    if (added.length) {
      this._trigger('add', { items: added }, senderId);
    }
    if (updated.length) {
      this._trigger('update', { items: updated, data: updatedData }, senderId);
    }
    if (removed.length) {
      this._trigger('remove', { items: removed }, senderId);
    }
  }
};

// copy subscription functionality from DataSet
DataView.prototype.on = DataSet.prototype.on;
DataView.prototype.off = DataSet.prototype.off;
DataView.prototype._trigger = DataSet.prototype._trigger;

// TODO: make these functions deprecated (replaced with `on` and `off` since version 0.5)
DataView.prototype.subscribe = DataView.prototype.on;
DataView.prototype.unsubscribe = DataView.prototype.off;

module.exports = DataView;

},{"./DataSet":2,"./util":73}],4:[function(require,module,exports){
/**
 * A queue
 * @param {Object} options
 *            Available options:
 *            - delay: number    When provided, the queue will be flushed
 *                               automatically after an inactivity of this delay
 *                               in milliseconds.
 *                               Default value is null.
 *            - max: number      When the queue exceeds the given maximum number
 *                               of entries, the queue is flushed automatically.
 *                               Default value of max is Infinity.
 * @constructor
 */
'use strict';

function Queue(options) {
  // options
  this.delay = null;
  this.max = Infinity;

  // properties
  this._queue = [];
  this._timeout = null;
  this._extended = null;

  this.setOptions(options);
}

/**
 * Update the configuration of the queue
 * @param {Object} options
 *            Available options:
 *            - delay: number    When provided, the queue will be flushed
 *                               automatically after an inactivity of this delay
 *                               in milliseconds.
 *                               Default value is null.
 *            - max: number      When the queue exceeds the given maximum number
 *                               of entries, the queue is flushed automatically.
 *                               Default value of max is Infinity.
 * @param options
 */
Queue.prototype.setOptions = function (options) {
  if (options && typeof options.delay !== 'undefined') {
    this.delay = options.delay;
  }
  if (options && typeof options.max !== 'undefined') {
    this.max = options.max;
  }

  this._flushIfNeeded();
};

/**
 * Extend an object with queuing functionality.
 * The object will be extended with a function flush, and the methods provided
 * in options.replace will be replaced with queued ones.
 * @param {Object} object
 * @param {Object} options
 *            Available options:
 *            - replace: Array.<string>
 *                               A list with method names of the methods
 *                               on the object to be replaced with queued ones.
 *            - delay: number    When provided, the queue will be flushed
 *                               automatically after an inactivity of this delay
 *                               in milliseconds.
 *                               Default value is null.
 *            - max: number      When the queue exceeds the given maximum number
 *                               of entries, the queue is flushed automatically.
 *                               Default value of max is Infinity.
 * @return {Queue} Returns the created queue
 */
Queue.extend = function (object, options) {
  var queue = new Queue(options);

  if (object.flush !== undefined) {
    throw new Error('Target object already has a property flush');
  }
  object.flush = function () {
    queue.flush();
  };

  var methods = [{
    name: 'flush',
    original: undefined
  }];

  if (options && options.replace) {
    for (var i = 0; i < options.replace.length; i++) {
      var name = options.replace[i];
      methods.push({
        name: name,
        original: object[name]
      });
      queue.replace(object, name);
    }
  }

  queue._extended = {
    object: object,
    methods: methods
  };

  return queue;
};

/**
 * Destroy the queue. The queue will first flush all queued actions, and in
 * case it has extended an object, will restore the original object.
 */
Queue.prototype.destroy = function () {
  this.flush();

  if (this._extended) {
    var object = this._extended.object;
    var methods = this._extended.methods;
    for (var i = 0; i < methods.length; i++) {
      var method = methods[i];
      if (method.original) {
        object[method.name] = method.original;
      } else {
        delete object[method.name];
      }
    }
    this._extended = null;
  }
};

/**
 * Replace a method on an object with a queued version
 * @param {Object} object   Object having the method
 * @param {string} method   The method name
 */
Queue.prototype.replace = function (object, method) {
  var me = this;
  var original = object[method];
  if (!original) {
    throw new Error('Method ' + method + ' undefined');
  }

  object[method] = function () {
    // create an Array with the arguments
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    // add this call to the queue
    me.queue({
      args: args,
      fn: original,
      context: this
    });
  };
};

/**
 * Queue a call
 * @param {function | {fn: function, args: Array} | {fn: function, args: Array, context: Object}} entry
 */
Queue.prototype.queue = function (entry) {
  if (typeof entry === 'function') {
    this._queue.push({ fn: entry });
  } else {
    this._queue.push(entry);
  }

  this._flushIfNeeded();
};

/**
 * Check whether the queue needs to be flushed
 * @private
 */
Queue.prototype._flushIfNeeded = function () {
  // flush when the maximum is exceeded.
  if (this._queue.length > this.max) {
    this.flush();
  }

  // flush after a period of inactivity when a delay is configured
  clearTimeout(this._timeout);
  if (this.queue.length > 0 && typeof this.delay === 'number') {
    var me = this;
    this._timeout = setTimeout(function () {
      me.flush();
    }, this.delay);
  }
};

/**
 * Flush all queued calls
 */
Queue.prototype.flush = function () {
  while (this._queue.length > 0) {
    var entry = this._queue.shift();
    entry.fn.apply(entry.context || entry.fn, entry.args || []);
  }
};

module.exports = Queue;

},{}],5:[function(require,module,exports){
'use strict';

var Hammer = require('./module/hammer');

/**
 * Register a touch event, taking place before a gesture
 * @param {Hammer} hammer       A hammer instance
 * @param {function} callback   Callback, called as callback(event)
 */
exports.onTouch = function (hammer, callback) {
  callback.inputHandler = function (event) {
    if (event.isFirst && !isTouching) {
      callback(event);

      isTouching = true;
      setTimeout(function () {
        isTouching = false;
      }, 0);
    }
  };

  hammer.on('hammer.input', callback.inputHandler);
};

// isTouching is true while a touch action is being emitted
// this is a hack to prevent `touch` from being fired twice
var isTouching = false;

/**
 * Register a release event, taking place after a gesture
 * @param {Hammer} hammer       A hammer instance
 * @param {function} callback   Callback, called as callback(event)
 */
exports.onRelease = function (hammer, callback) {
  callback.inputHandler = function (event) {
    if (event.isFinal && !isReleasing) {
      callback(event);

      isReleasing = true;
      setTimeout(function () {
        isReleasing = false;
      }, 0);
    }
  };

  return hammer.on('hammer.input', callback.inputHandler);
};

// isReleasing is true while a release action is being emitted
// this is a hack to prevent `release` from being fired twice
var isReleasing = false;

/**
 * Unregister a touch event, taking place before a gesture
 * @param {Hammer} hammer       A hammer instance
 * @param {function} callback   Callback, called as callback(event)
 */
exports.offTouch = function (hammer, callback) {
  hammer.off('hammer.input', callback.inputHandler);
};

/**
 * Unregister a release event, taking place before a gesture
 * @param {Hammer} hammer       A hammer instance
 * @param {function} callback   Callback, called as callback(event)
 */
exports.offRelease = exports.offTouch;

},{"./module/hammer":6}],6:[function(require,module,exports){
// Only load hammer.js when in a browser environment
// (loading hammer.js in a node.js environment gives errors)
'use strict';

if (typeof window !== 'undefined') {
  var propagating = require('propagating-hammerjs');
  var Hammer = window['Hammer'] || require('hammerjs');
  module.exports = propagating(Hammer, {
    preventDefault: 'mouse'
  });
} else {
  module.exports = function () {
    throw Error('hammer.js is only available in a browser, not in node.js.');
  };
}

},{"hammerjs":75,"propagating-hammerjs":78}],7:[function(require,module,exports){
// first check if moment.js is already loaded in the browser window, if so,
// use this instance. Else, load via commonjs.
'use strict';

module.exports = typeof window !== 'undefined' && window['moment'] || require('moment');

},{"moment":77}],8:[function(require,module,exports){
(function (global){
'use strict';

var _rng;

var globalVar = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : null;

if (globalVar && globalVar.crypto && crypto.getRandomValues) {
  // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
  // Moderately fast, high quality
  var _rnds8 = new Uint8Array(16);
  _rng = function whatwgRNG() {
    crypto.getRandomValues(_rnds8);
    return _rnds8;
  };
}

if (!_rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var _rnds = new Array(16);
  _rng = function () {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return _rnds;
  };
}

//     uuid.js
//
//     Copyright (c) 2010-2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

// Unique ID creation requires a high quality random # generator.  We feature
// detect to determine the best RNG source, normalizing to a function that
// returns 128-bits of randomness, since that's what's usually required

//var _rng = require('./rng');

// Maps for number <-> hex string conversion
var _byteToHex = [];
var _hexToByte = {};
for (var i = 0; i < 256; i++) {
  _byteToHex[i] = (i + 0x100).toString(16).substr(1);
  _hexToByte[_byteToHex[i]] = i;
}

// **`parse()` - Parse a UUID into it's component bytes**
function parse(s, buf, offset) {
  var i = buf && offset || 0,
      ii = 0;

  buf = buf || [];
  s.toLowerCase().replace(/[0-9a-f]{2}/g, function (oct) {
    if (ii < 16) {
      // Don't overflow!
      buf[i + ii++] = _hexToByte[oct];
    }
  });

  // Zero out remaining bytes if string was short
  while (ii < 16) {
    buf[i + ii++] = 0;
  }

  return buf;
}

// **`unparse()` - Convert UUID byte array (ala parse()) into a string**
function unparse(buf, offset) {
  var i = offset || 0,
      bth = _byteToHex;
  return bth[buf[i++]] + bth[buf[i++]] + bth[buf[i++]] + bth[buf[i++]] + '-' + bth[buf[i++]] + bth[buf[i++]] + '-' + bth[buf[i++]] + bth[buf[i++]] + '-' + bth[buf[i++]] + bth[buf[i++]] + '-' + bth[buf[i++]] + bth[buf[i++]] + bth[buf[i++]] + bth[buf[i++]] + bth[buf[i++]] + bth[buf[i++]];
}

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

// random #'s we need to init node and clockseq
var _seedBytes = _rng();

// Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
var _nodeId = [_seedBytes[0] | 0x01, _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]];

// Per 4.2.2, randomize (14 bit) clockseq
var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

// Previous uuid creation time
var _lastMSecs = 0,
    _lastNSecs = 0;

// See https://github.com/broofa/node-uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};

  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = msecs / 0x100000000 * 10000 & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  var node = options.node || _nodeId;
  for (var n = 0; n < 6; n++) {
    b[i + n] = node[n];
  }

  return buf ? buf : unparse(b);
}

// **`v4()` - Generate random UUID**

// See https://github.com/broofa/node-uuid for API details
function v4(options, buf, offset) {
  // Deprecated - 'format' argument, as supported in v1.2
  var i = buf && offset || 0;

  if (typeof options == 'string') {
    buf = options == 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || _rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ii++) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || unparse(rnds);
}

// Export public API
var uuid = v4;
uuid.v1 = v1;
uuid.v4 = v4;
uuid.parse = parse;
uuid.unparse = unparse;

module.exports = uuid;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],9:[function(require,module,exports){
/**
 * @class Images
 * This class loads images and keeps them stored.
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Images = (function () {
    function Images(callback) {
        _classCallCheck(this, Images);

        this.images = {};
        this.imageBroken = {};
        this.callback = callback;
    }

    /**
     * @param {string} url                      The Url to cache the image as
      * @return {Image} imageToLoadBrokenUrlOn  The image object
     */

    _createClass(Images, [{
        key: "_addImageToCache",
        value: function _addImageToCache(url, imageToCache) {
            // IE11 fix -- thanks dponch!
            if (imageToCache.width === 0) {
                document.body.appendChild(imageToCache);
                imageToCache.width = imageToCache.offsetWidth;
                imageToCache.height = imageToCache.offsetHeight;
                document.body.removeChild(imageToCache);
            }

            this.images[url] = imageToCache;
        }

        /**
         * @param {string} url                      The original Url that failed to load, if the broken image is successfully loaded it will be added to the cache using this Url as the key so that subsequent requests for this Url will return the broken image
         * @param {string} brokenUrl                Url the broken image to try and load
         * @return {Image} imageToLoadBrokenUrlOn   The image object
         */
    }, {
        key: "_tryloadBrokenUrl",
        value: function _tryloadBrokenUrl(url, brokenUrl, imageToLoadBrokenUrlOn) {
            var _this = this;

            //If any of the parameters aren't specified then exit the function because nothing constructive can be done
            if (url === undefined || brokenUrl === undefined || imageToLoadBrokenUrlOn === undefined) return;

            //Clear the old subscription to the error event and put a new in place that only handle errors in loading the brokenImageUrl
            imageToLoadBrokenUrlOn.onerror = function () {
                console.error("Could not load brokenImage:", brokenUrl);
                //Add an empty image to the cache so that when subsequent load calls are made for the url we don't try load the image and broken image again
                _this._addImageToCache(url, new Image());
            };

            //Set the source of the image to the brokenUrl, this is actually what kicks off the loading of the broken image
            imageToLoadBrokenUrlOn.src = brokenUrl;
        }

        /**
         * @return {Image} imageToRedrawWith The images that will be passed to the callback when it is invoked
         */
    }, {
        key: "_redrawWithImage",
        value: function _redrawWithImage(imageToRedrawWith) {
            if (this.callback) {
                this.callback(imageToRedrawWith);
            }
        }

        /**
         * @param {string} url          Url of the image
         * @param {string} brokenUrl    Url of an image to use if the url image is not found
         * @return {Image} img          The image object
         */
    }, {
        key: "load",
        value: function load(url, brokenUrl, id) {
            var _this2 = this;

            //Try and get the image from the cache, if successful then return the cached image
            var cachedImage = this.images[url];
            if (cachedImage) return cachedImage;

            //Create a new image
            var img = new Image();

            //Subscribe to the event that is raised if the image loads successfully
            img.onload = function () {
                //Add the image to the cache and then request a redraw
                _this2._addImageToCache(url, img);
                _this2._redrawWithImage(img);
            };

            //Subscribe to the event that is raised if the image fails to load
            img.onerror = function () {
                console.error("Could not load image:", url);
                //Try and load the image specified by the brokenUrl using
                _this2._tryloadBrokenUrl(url, brokenUrl, img);
            };

            //Set the source of the image to the url, this is actuall what kicks off the loading of the image
            img.src = url;

            //Return the new image
            return img;
        }
    }]);

    return Images;
})();

exports["default"] = Images;
module.exports = exports["default"];

},{}],10:[function(require,module,exports){
// Load custom shapes into CanvasRenderingContext2D
'use strict';

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _modulesGroups = require('./modules/Groups');

var _modulesGroups2 = _interopRequireDefault(_modulesGroups);

var _modulesNodesHandler = require('./modules/NodesHandler');

var _modulesNodesHandler2 = _interopRequireDefault(_modulesNodesHandler);

var _modulesEdgesHandler = require('./modules/EdgesHandler');

var _modulesEdgesHandler2 = _interopRequireDefault(_modulesEdgesHandler);

var _modulesPhysicsEngine = require('./modules/PhysicsEngine');

var _modulesPhysicsEngine2 = _interopRequireDefault(_modulesPhysicsEngine);

var _modulesClustering = require('./modules/Clustering');

var _modulesClustering2 = _interopRequireDefault(_modulesClustering);

var _modulesCanvasRenderer = require('./modules/CanvasRenderer');

var _modulesCanvasRenderer2 = _interopRequireDefault(_modulesCanvasRenderer);

var _modulesCanvas = require('./modules/Canvas');

var _modulesCanvas2 = _interopRequireDefault(_modulesCanvas);

var _modulesView = require('./modules/View');

var _modulesView2 = _interopRequireDefault(_modulesView);

var _modulesInteractionHandler = require('./modules/InteractionHandler');

var _modulesInteractionHandler2 = _interopRequireDefault(_modulesInteractionHandler);

var _modulesSelectionHandler = require("./modules/SelectionHandler");

var _modulesSelectionHandler2 = _interopRequireDefault(_modulesSelectionHandler);

var _modulesLayoutEngine = require("./modules/LayoutEngine");

var _modulesLayoutEngine2 = _interopRequireDefault(_modulesLayoutEngine);

var _modulesManipulationSystem = require("./modules/ManipulationSystem");

var _modulesManipulationSystem2 = _interopRequireDefault(_modulesManipulationSystem);

var _sharedConfigurator = require("./../shared/Configurator");

var _sharedConfigurator2 = _interopRequireDefault(_sharedConfigurator);

var _sharedValidator = require("./../shared/Validator");

var _sharedValidator2 = _interopRequireDefault(_sharedValidator);

var _optionsJs = require('./options.js');

var _modulesKamadaKawaiJs = require("./modules/KamadaKawai.js");

var _modulesKamadaKawaiJs2 = _interopRequireDefault(_modulesKamadaKawaiJs);

/**
 * @constructor Network
 * Create a network visualization, displaying nodes and edges.
 *
 * @param {Element} container   The DOM element in which the Network will
 *                                  be created. Normally a div element.
 * @param {Object} data         An object containing parameters
 *                              {Array} nodes
 *                              {Array} edges
 * @param {Object} options      Options
 */
require('./shapes');

var Emitter = require('emitter-component');
var Hammer = require('../module/hammer');
var util = require('../util');
var DataSet = require('../DataSet');
var DataView = require('../DataView');
var dotparser = require('./dotparser');
var gephiParser = require('./gephiParser');
var Images = require('./Images');
var Activator = require('../shared/Activator');
var locales = require('./locales');

function Network(container, data, options) {
  var _this = this;

  if (!(this instanceof Network)) {
    throw new SyntaxError('Constructor must be called with the new operator');
  }

  // set constant values
  this.options = {};
  this.defaultOptions = {
    locale: 'en',
    locales: locales,
    clickToUse: false
  };
  util.extend(this.options, this.defaultOptions);

  // containers for nodes and edges
  this.body = {
    container: container,
    nodes: {},
    nodeIndices: [],
    edges: {},
    edgeIndices: [],
    emitter: {
      on: this.on.bind(this),
      off: this.off.bind(this),
      emit: this.emit.bind(this),
      once: this.once.bind(this)
    },
    eventListeners: {
      onTap: function onTap() {},
      onTouch: function onTouch() {},
      onDoubleTap: function onDoubleTap() {},
      onHold: function onHold() {},
      onDragStart: function onDragStart() {},
      onDrag: function onDrag() {},
      onDragEnd: function onDragEnd() {},
      onMouseWheel: function onMouseWheel() {},
      onPinch: function onPinch() {},
      onMouseMove: function onMouseMove() {},
      onRelease: function onRelease() {},
      onContext: function onContext() {}
    },
    data: {
      nodes: null, // A DataSet or DataView
      edges: null // A DataSet or DataView
    },
    functions: {
      createNode: function createNode() {},
      createEdge: function createEdge() {},
      getPointer: function getPointer() {}
    },
    modules: {},
    view: {
      scale: 1,
      translation: { x: 0, y: 0 }
    }
  };

  // bind the event listeners
  this.bindEventListeners();

  // setting up all modules
  this.images = new Images(function () {
    return _this.body.emitter.emit("_requestRedraw");
  }); // object with images
  this.groups = new _modulesGroups2['default'](); // object with groups
  this.canvas = new _modulesCanvas2['default'](this.body); // DOM handler
  this.selectionHandler = new _modulesSelectionHandler2['default'](this.body, this.canvas); // Selection handler
  this.interactionHandler = new _modulesInteractionHandler2['default'](this.body, this.canvas, this.selectionHandler); // Interaction handler handles all the hammer bindings (that are bound by canvas), key
  this.view = new _modulesView2['default'](this.body, this.canvas); // camera handler, does animations and zooms
  this.renderer = new _modulesCanvasRenderer2['default'](this.body, this.canvas); // renderer, starts renderloop, has events that modules can hook into
  this.physics = new _modulesPhysicsEngine2['default'](this.body); // physics engine, does all the simulations
  this.layoutEngine = new _modulesLayoutEngine2['default'](this.body); // layout engine for inital layout and hierarchical layout
  this.clustering = new _modulesClustering2['default'](this.body); // clustering api
  this.manipulation = new _modulesManipulationSystem2['default'](this.body, this.canvas, this.selectionHandler); // data manipulation system

  this.nodesHandler = new _modulesNodesHandler2['default'](this.body, this.images, this.groups, this.layoutEngine); // Handle adding, deleting and updating of nodes as well as global options
  this.edgesHandler = new _modulesEdgesHandler2['default'](this.body, this.images, this.groups); // Handle adding, deleting and updating of edges as well as global options

  this.body.modules["kamadaKawai"] = new _modulesKamadaKawaiJs2['default'](this.body, 150, 0.05); // Layouting algorithm.
  this.body.modules["clustering"] = this.clustering;

  // create the DOM elements
  this.canvas._create();

  // apply options
  this.setOptions(options);

  // load data (the disable start variable will be the same as the enabled clustering)
  this.setData(data);
}

// Extend Network with an Emitter mixin
Emitter(Network.prototype);

/**
 * Set options
 * @param {Object} options
 */
Network.prototype.setOptions = function (options) {
  var _this2 = this;

  if (options !== undefined) {

    var errorFound = _sharedValidator2['default'].validate(options, _optionsJs.allOptions);
    if (errorFound === true) {
      console.log('%cErrors have been found in the supplied options object.', _sharedValidator.printStyle);
    }

    // copy the global fields over
    var fields = ['locale', 'locales', 'clickToUse'];
    util.selectiveDeepExtend(fields, this.options, options);

    // the hierarchical system can adapt the edges and the physics to it's own options because not all combinations work with the hierarichical system.
    options = this.layoutEngine.setOptions(options.layout, options);

    this.canvas.setOptions(options); // options for canvas are in globals

    // pass the options to the modules
    this.groups.setOptions(options.groups);
    this.nodesHandler.setOptions(options.nodes);
    this.edgesHandler.setOptions(options.edges);
    this.physics.setOptions(options.physics);
    this.manipulation.setOptions(options.manipulation, options, this.options); // manipulation uses the locales in the globals

    this.interactionHandler.setOptions(options.interaction);
    this.renderer.setOptions(options.interaction); // options for rendering are in interaction
    this.selectionHandler.setOptions(options.interaction); // options for selection are in interaction

    // reload the settings of the nodes to apply changes in groups that are not referenced by pointer.
    if (options.groups !== undefined) {
      this.body.emitter.emit("refreshNodes");
    }
    // these two do not have options at the moment, here for completeness
    //this.view.setOptions(options.view);
    //this.clustering.setOptions(options.clustering);

    if ('configure' in options) {
      if (!this.configurator) {
        this.configurator = new _sharedConfigurator2['default'](this, this.body.container, _optionsJs.configureOptions, this.canvas.pixelRatio);
      }

      this.configurator.setOptions(options.configure);
    }

    // if the configuration system is enabled, copy all options and put them into the config system
    if (this.configurator && this.configurator.options.enabled === true) {
      var networkOptions = { nodes: {}, edges: {}, layout: {}, interaction: {}, manipulation: {}, physics: {}, global: {} };
      util.deepExtend(networkOptions.nodes, this.nodesHandler.options);
      util.deepExtend(networkOptions.edges, this.edgesHandler.options);
      util.deepExtend(networkOptions.layout, this.layoutEngine.options);
      // load the selectionHandler and render default options in to the interaction group
      util.deepExtend(networkOptions.interaction, this.selectionHandler.options);
      util.deepExtend(networkOptions.interaction, this.renderer.options);

      util.deepExtend(networkOptions.interaction, this.interactionHandler.options);
      util.deepExtend(networkOptions.manipulation, this.manipulation.options);
      util.deepExtend(networkOptions.physics, this.physics.options);

      // load globals into the global object
      util.deepExtend(networkOptions.global, this.canvas.options);
      util.deepExtend(networkOptions.global, this.options);

      this.configurator.setModuleOptions(networkOptions);
    }

    // handle network global options
    if (options.clickToUse !== undefined) {
      if (options.clickToUse === true) {
        if (this.activator === undefined) {
          this.activator = new Activator(this.canvas.frame);
          this.activator.on('change', function () {
            _this2.body.emitter.emit("activate");
          });
        }
      } else {
        if (this.activator !== undefined) {
          this.activator.destroy();
          delete this.activator;
        }
        this.body.emitter.emit("activate");
      }
    } else {
      this.body.emitter.emit("activate");
    }

    this.canvas.setSize();
    // start the physics simulation. Can be safely called multiple times.
    this.body.emitter.emit("startSimulation");
  }
};

/**
 * Update the this.body.nodeIndices with the most recent node index list
 * @private
 */
Network.prototype._updateVisibleIndices = function () {
  var nodes = this.body.nodes;
  var edges = this.body.edges;
  this.body.nodeIndices = [];
  this.body.edgeIndices = [];

  for (var nodeId in nodes) {
    if (nodes.hasOwnProperty(nodeId)) {
      if (nodes[nodeId].options.hidden === false) {
        this.body.nodeIndices.push(nodeId);
      }
    }
  }

  for (var edgeId in edges) {
    if (edges.hasOwnProperty(edgeId)) {
      if (edges[edgeId].options.hidden === false) {
        this.body.edgeIndices.push(edgeId);
      }
    }
  }
};

/**
 * Bind all events
 */
Network.prototype.bindEventListeners = function () {
  var _this3 = this;

  // this event will trigger a rebuilding of the cache everything. Used when nodes or edges have been added or removed.
  this.body.emitter.on("_dataChanged", function () {
    // update shortcut lists
    _this3._updateVisibleIndices();
    _this3.body.emitter.emit("_requestRedraw");
    // call the dataUpdated event because the only difference between the two is the updating of the indices
    _this3.body.emitter.emit("_dataUpdated");
  });

  // this is called when options of EXISTING nodes or edges have changed.
  this.body.emitter.on("_dataUpdated", function () {
    // update values
    _this3._updateValueRange(_this3.body.nodes);
    _this3._updateValueRange(_this3.body.edges);
    // start simulation (can be called safely, even if already running)
    _this3.body.emitter.emit("startSimulation");
    _this3.body.emitter.emit("_requestRedraw");
  });
};

/**
 * Set nodes and edges, and optionally options as well.
 *
 * @param {Object} data              Object containing parameters:
 *                                   {Array | DataSet | DataView} [nodes] Array with nodes
 *                                   {Array | DataSet | DataView} [edges] Array with edges
 *                                   {String} [dot] String containing data in DOT format
 *                                   {String} [gephi] String containing data in gephi JSON format
 *                                   {Options} [options] Object with options
 */
Network.prototype.setData = function (data) {
  // reset the physics engine.
  this.body.emitter.emit("resetPhysics");
  this.body.emitter.emit("_resetData");

  // unselect all to ensure no selections from old data are carried over.
  this.selectionHandler.unselectAll();

  if (data && data.dot && (data.nodes || data.edges)) {
    throw new SyntaxError('Data must contain either parameter "dot" or ' + ' parameter pair "nodes" and "edges", but not both.');
  }

  // set options
  this.setOptions(data && data.options);
  // set all data
  if (data && data.dot) {
    console.log('The dot property has been depricated. Please use the static convertDot method to convert DOT into vis.network format and use the normal data format with nodes and edges. This converter is used like this: var data = vis.network.convertDot(dotString);');
    // parse DOT file
    var dotData = dotparser.DOTToGraph(data.dot);
    this.setData(dotData);
    return;
  } else if (data && data.gephi) {
    // parse DOT file
    console.log('The gephi property has been depricated. Please use the static convertGephi method to convert gephi into vis.network format and use the normal data format with nodes and edges. This converter is used like this: var data = vis.network.convertGephi(gephiJson);');
    var gephiData = gephiParser.parseGephi(data.gephi);
    this.setData(gephiData);
    return;
  } else {
    this.nodesHandler.setData(data && data.nodes, true);
    this.edgesHandler.setData(data && data.edges, true);
  }

  // emit change in data
  this.body.emitter.emit("_dataChanged");

  // emit data loaded
  this.body.emitter.emit("_dataLoaded");

  // find a stable position or start animating to a stable position
  this.body.emitter.emit("initPhysics");
};

/**
 * Cleans up all bindings of the network, removing it fully from the memory IF the variable is set to null after calling this function.
 * var network = new vis.Network(..);
 * network.destroy();
 * network = null;
 */
Network.prototype.destroy = function () {
  this.body.emitter.emit("destroy");
  // clear events
  this.body.emitter.off();
  this.off();

  // delete modules
  delete this.groups;
  delete this.canvas;
  delete this.selectionHandler;
  delete this.interactionHandler;
  delete this.view;
  delete this.renderer;
  delete this.physics;
  delete this.layoutEngine;
  delete this.clustering;
  delete this.manipulation;
  delete this.nodesHandler;
  delete this.edgesHandler;
  delete this.configurator;
  delete this.images;

  for (var nodeId in this.body.nodes) {
    delete this.body.nodes[nodeId];
  }
  for (var edgeId in this.body.edges) {
    delete this.body.edges[edgeId];
  }

  // remove the container and everything inside it recursively
  util.recursiveDOMDelete(this.body.container);
};

/**
 * Update the values of all object in the given array according to the current
 * value range of the objects in the array.
 * @param {Object} obj    An object containing a set of Edges or Nodes
 *                        The objects must have a method getValue() and
 *                        setValueRange(min, max).
 * @private
 */
Network.prototype._updateValueRange = function (obj) {
  var id;

  // determine the range of the objects
  var valueMin = undefined;
  var valueMax = undefined;
  var valueTotal = 0;
  for (id in obj) {
    if (obj.hasOwnProperty(id)) {
      var value = obj[id].getValue();
      if (value !== undefined) {
        valueMin = valueMin === undefined ? value : Math.min(value, valueMin);
        valueMax = valueMax === undefined ? value : Math.max(value, valueMax);
        valueTotal += value;
      }
    }
  }

  // adjust the range of all objects
  if (valueMin !== undefined && valueMax !== undefined) {
    for (id in obj) {
      if (obj.hasOwnProperty(id)) {
        obj[id].setValueRange(valueMin, valueMax, valueTotal);
      }
    }
  }
};

/**
 * Returns true when the Network is active.
 * @returns {boolean}
 */
Network.prototype.isActive = function () {
  return !this.activator || this.activator.active;
};

Network.prototype.setSize = function () {
  return this.canvas.setSize.apply(this.canvas, arguments);
};
Network.prototype.canvasToDOM = function () {
  return this.canvas.canvasToDOM.apply(this.canvas, arguments);
};
Network.prototype.DOMtoCanvas = function () {
  return this.canvas.DOMtoCanvas.apply(this.canvas, arguments);
};
Network.prototype.findNode = function () {
  return this.clustering.findNode.apply(this.clustering, arguments);
};
Network.prototype.isCluster = function () {
  return this.clustering.isCluster.apply(this.clustering, arguments);
};
Network.prototype.openCluster = function () {
  return this.clustering.openCluster.apply(this.clustering, arguments);
};
Network.prototype.cluster = function () {
  return this.clustering.cluster.apply(this.clustering, arguments);
};
Network.prototype.getNodesInCluster = function () {
  return this.clustering.getNodesInCluster.apply(this.clustering, arguments);
};
Network.prototype.clusterByConnection = function () {
  return this.clustering.clusterByConnection.apply(this.clustering, arguments);
};
Network.prototype.clusterByHubsize = function () {
  return this.clustering.clusterByHubsize.apply(this.clustering, arguments);
};
Network.prototype.clusterOutliers = function () {
  return this.clustering.clusterOutliers.apply(this.clustering, arguments);
};
Network.prototype.getSeed = function () {
  return this.layoutEngine.getSeed.apply(this.layoutEngine, arguments);
};
Network.prototype.enableEditMode = function () {
  return this.manipulation.enableEditMode.apply(this.manipulation, arguments);
};
Network.prototype.disableEditMode = function () {
  return this.manipulation.disableEditMode.apply(this.manipulation, arguments);
};
Network.prototype.addNodeMode = function () {
  return this.manipulation.addNodeMode.apply(this.manipulation, arguments);
};
Network.prototype.editNode = function () {
  return this.manipulation.editNode.apply(this.manipulation, arguments);
};
Network.prototype.editNodeMode = function () {
  console.log("Deprecated: Please use editNode instead of editNodeMode.");return this.manipulation.editNode.apply(this.manipulation, arguments);
};
Network.prototype.addEdgeMode = function () {
  return this.manipulation.addEdgeMode.apply(this.manipulation, arguments);
};
Network.prototype.editEdgeMode = function () {
  return this.manipulation.editEdgeMode.apply(this.manipulation, arguments);
};
Network.prototype.deleteSelected = function () {
  return this.manipulation.deleteSelected.apply(this.manipulation, arguments);
};
Network.prototype.getPositions = function () {
  return this.nodesHandler.getPositions.apply(this.nodesHandler, arguments);
};
Network.prototype.storePositions = function () {
  return this.nodesHandler.storePositions.apply(this.nodesHandler, arguments);
};
Network.prototype.moveNode = function () {
  return this.nodesHandler.moveNode.apply(this.nodesHandler, arguments);
};
Network.prototype.getBoundingBox = function () {
  return this.nodesHandler.getBoundingBox.apply(this.nodesHandler, arguments);
};
Network.prototype.getConnectedNodes = function (objectId) {
  if (this.body.nodes[objectId] !== undefined) {
    return this.nodesHandler.getConnectedNodes.apply(this.nodesHandler, arguments);
  } else {
    return this.edgesHandler.getConnectedNodes.apply(this.edgesHandler, arguments);
  }
};
Network.prototype.getConnectedEdges = function () {
  return this.nodesHandler.getConnectedEdges.apply(this.nodesHandler, arguments);
};
Network.prototype.startSimulation = function () {
  return this.physics.startSimulation.apply(this.physics, arguments);
};
Network.prototype.stopSimulation = function () {
  return this.physics.stopSimulation.apply(this.physics, arguments);
};
Network.prototype.stabilize = function () {
  return this.physics.stabilize.apply(this.physics, arguments);
};
Network.prototype.getSelection = function () {
  return this.selectionHandler.getSelection.apply(this.selectionHandler, arguments);
};
Network.prototype.setSelection = function () {
  return this.selectionHandler.setSelection.apply(this.selectionHandler, arguments);
};
Network.prototype.getSelectedNodes = function () {
  return this.selectionHandler.getSelectedNodes.apply(this.selectionHandler, arguments);
};
Network.prototype.getSelectedEdges = function () {
  return this.selectionHandler.getSelectedEdges.apply(this.selectionHandler, arguments);
};
Network.prototype.getNodeAt = function () {
  var node = this.selectionHandler.getNodeAt.apply(this.selectionHandler, arguments);
  if (node !== undefined && node.id !== undefined) {
    return node.id;
  }
  return node;
};
Network.prototype.getEdgeAt = function () {
  var edge = this.selectionHandler.getEdgeAt.apply(this.selectionHandler, arguments);
  if (edge !== undefined && edge.id !== undefined) {
    return edge.id;
  }
  return edge;
};
Network.prototype.selectNodes = function () {
  return this.selectionHandler.selectNodes.apply(this.selectionHandler, arguments);
};
Network.prototype.selectEdges = function () {
  return this.selectionHandler.selectEdges.apply(this.selectionHandler, arguments);
};
Network.prototype.unselectAll = function () {
  this.selectionHandler.unselectAll.apply(this.selectionHandler, arguments);
  this.redraw();
};
Network.prototype.redraw = function () {
  return this.renderer.redraw.apply(this.renderer, arguments);
};
Network.prototype.getScale = function () {
  return this.view.getScale.apply(this.view, arguments);
};
Network.prototype.getViewPosition = function () {
  return this.view.getViewPosition.apply(this.view, arguments);
};
Network.prototype.fit = function () {
  return this.view.fit.apply(this.view, arguments);
};
Network.prototype.moveTo = function () {
  return this.view.moveTo.apply(this.view, arguments);
};
Network.prototype.focus = function () {
  return this.view.focus.apply(this.view, arguments);
};
Network.prototype.releaseNode = function () {
  return this.view.releaseNode.apply(this.view, arguments);
};
Network.prototype.getOptionsFromConfigurator = function () {
  var options = {};
  if (this.configurator) {
    options = this.configurator.getOptions.apply(this.configurator);
  }
  return options;
};

module.exports = Network;

},{"../DataSet":2,"../DataView":3,"../module/hammer":6,"../shared/Activator":69,"../util":73,"./../shared/Configurator":71,"./../shared/Validator":72,"./Images":9,"./dotparser":12,"./gephiParser":13,"./locales":14,"./modules/Canvas":15,"./modules/CanvasRenderer":16,"./modules/Clustering":17,"./modules/EdgesHandler":18,"./modules/Groups":19,"./modules/InteractionHandler":20,"./modules/KamadaKawai.js":21,"./modules/LayoutEngine":22,"./modules/ManipulationSystem":23,"./modules/NodesHandler":24,"./modules/PhysicsEngine":25,"./modules/SelectionHandler":26,"./modules/View":27,"./options.js":67,"./shapes":68,"emitter-component":74}],11:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var util = require("../util");

var NetworkUtil = (function () {
  function NetworkUtil() {
    _classCallCheck(this, NetworkUtil);
  }

  /**
   * Find the center position of the network considering the bounding boxes
   * @private
   */

  _createClass(NetworkUtil, null, [{
    key: "_getRange",
    value: function _getRange(allNodes) {
      var specificNodes = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

      var minY = 1e9,
          maxY = -1e9,
          minX = 1e9,
          maxX = -1e9,
          node;
      if (specificNodes.length > 0) {
        for (var i = 0; i < specificNodes.length; i++) {
          node = allNodes[specificNodes[i]];
          if (minX > node.shape.boundingBox.left) {
            minX = node.shape.boundingBox.left;
          }
          if (maxX < node.shape.boundingBox.right) {
            maxX = node.shape.boundingBox.right;
          }
          if (minY > node.shape.boundingBox.top) {
            minY = node.shape.boundingBox.top;
          } // top is negative, bottom is positive
          if (maxY < node.shape.boundingBox.bottom) {
            maxY = node.shape.boundingBox.bottom;
          } // top is negative, bottom is positive
        }
      }

      if (minX === 1e9 && maxX === -1e9 && minY === 1e9 && maxY === -1e9) {
        minY = 0, maxY = 0, minX = 0, maxX = 0;
      }
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    /**
     * Find the center position of the network
     * @private
     */
  }, {
    key: "_getRangeCore",
    value: function _getRangeCore(allNodes) {
      var specificNodes = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

      var minY = 1e9,
          maxY = -1e9,
          minX = 1e9,
          maxX = -1e9,
          node;
      if (specificNodes.length > 0) {
        for (var i = 0; i < specificNodes.length; i++) {
          node = allNodes[specificNodes[i]];
          if (minX > node.x) {
            minX = node.x;
          }
          if (maxX < node.x) {
            maxX = node.x;
          }
          if (minY > node.y) {
            minY = node.y;
          } // top is negative, bottom is positive
          if (maxY < node.y) {
            maxY = node.y;
          } // top is negative, bottom is positive
        }
      }

      if (minX === 1e9 && maxX === -1e9 && minY === 1e9 && maxY === -1e9) {
        minY = 0, maxY = 0, minX = 0, maxX = 0;
      }
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    /**
     * @param {object} range = {minX: minX, maxX: maxX, minY: minY, maxY: maxY};
     * @returns {{x: number, y: number}}
     * @private
     */
  }, {
    key: "_findCenter",
    value: function _findCenter(range) {
      return { x: 0.5 * (range.maxX + range.minX),
        y: 0.5 * (range.maxY + range.minY) };
    }

    /**
     * This returns a clone of the options or options of the edge or node to be used for construction of new edges or check functions for new nodes.
     * @param item
     * @param type
     * @returns {{}}
     * @private
     */
  }, {
    key: "_cloneOptions",
    value: function _cloneOptions(item, type) {
      var clonedOptions = {};
      if (type === undefined || type === 'node') {
        util.deepExtend(clonedOptions, item.options, true);
        clonedOptions.x = item.x;
        clonedOptions.y = item.y;
        clonedOptions.amountOfConnections = item.edges.length;
      } else {
        util.deepExtend(clonedOptions, item.options, true);
      }
      return clonedOptions;
    }
  }]);

  return NetworkUtil;
})();

exports["default"] = NetworkUtil;
module.exports = exports["default"];

},{"../util":73}],12:[function(require,module,exports){
/**
 * Parse a text source containing data in DOT language into a JSON object.
 * The object contains two lists: one with nodes and one with edges.
 *
 * DOT language reference: http://www.graphviz.org/doc/info/lang.html
 *
 * DOT language attributes: http://graphviz.org/content/attrs
 *
 * @param {String} data     Text containing a graph in DOT-notation
 * @return {Object} graph   An object containing two parameters:
 *                          {Object[]} nodes
 *                          {Object[]} edges
 */
'use strict';

function parseDOT(data) {
  dot = data;
  return parseGraph();
}

// mapping of attributes from DOT (the keys) to vis.js (the values)
var NODE_ATTR_MAPPING = {
  'fontsize': 'font.size',
  'fontcolor': 'font.color',
  'labelfontcolor': 'font.color',
  'fontname': 'font.face',
  'color': ['color.border', 'color.background'],
  'fillcolor': 'color.background',
  'tooltip': 'title',
  'labeltooltip': 'title'
};
var EDGE_ATTR_MAPPING = Object.create(NODE_ATTR_MAPPING);
EDGE_ATTR_MAPPING.color = 'color.color';

// token types enumeration
var TOKENTYPE = {
  NULL: 0,
  DELIMITER: 1,
  IDENTIFIER: 2,
  UNKNOWN: 3
};

// map with all delimiters
var DELIMITERS = {
  '{': true,
  '}': true,
  '[': true,
  ']': true,
  ';': true,
  '=': true,
  ',': true,

  '->': true,
  '--': true
};

var dot = ''; // current dot file
var index = 0; // current index in dot file
var c = ''; // current token character in expr
var token = ''; // current token
var tokenType = TOKENTYPE.NULL; // type of the token

/**
 * Get the first character from the dot file.
 * The character is stored into the char c. If the end of the dot file is
 * reached, the function puts an empty string in c.
 */
function first() {
  index = 0;
  c = dot.charAt(0);
}

/**
 * Get the next character from the dot file.
 * The character is stored into the char c. If the end of the dot file is
 * reached, the function puts an empty string in c.
 */
function next() {
  index++;
  c = dot.charAt(index);
}

/**
 * Preview the next character from the dot file.
 * @return {String} cNext
 */
function nextPreview() {
  return dot.charAt(index + 1);
}

/**
 * Test whether given character is alphabetic or numeric
 * @param {String} c
 * @return {Boolean} isAlphaNumeric
 */
var regexAlphaNumeric = /[a-zA-Z_0-9.:#]/;
function isAlphaNumeric(c) {
  return regexAlphaNumeric.test(c);
}

/**
 * Merge all options of object b into object b
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 */
function merge(a, b) {
  if (!a) {
    a = {};
  }

  if (b) {
    for (var name in b) {
      if (b.hasOwnProperty(name)) {
        a[name] = b[name];
      }
    }
  }
  return a;
}

/**
 * Set a value in an object, where the provided parameter name can be a
 * path with nested parameters. For example:
 *
 *     var obj = {a: 2};
 *     setValue(obj, 'b.c', 3);     // obj = {a: 2, b: {c: 3}}
 *
 * @param {Object} obj
 * @param {String} path  A parameter name or dot-separated parameter path,
 *                      like "color.highlight.border".
 * @param {*} value
 */
function setValue(obj, path, value) {
  var keys = path.split('.');
  var o = obj;
  while (keys.length) {
    var key = keys.shift();
    if (keys.length) {
      // this isn't the end point
      if (!o[key]) {
        o[key] = {};
      }
      o = o[key];
    } else {
      // this is the end point
      o[key] = value;
    }
  }
}

/**
 * Add a node to a graph object. If there is already a node with
 * the same id, their attributes will be merged.
 * @param {Object} graph
 * @param {Object} node
 */
function addNode(graph, node) {
  var i, len;
  var current = null;

  // find root graph (in case of subgraph)
  var graphs = [graph]; // list with all graphs from current graph to root graph
  var root = graph;
  while (root.parent) {
    graphs.push(root.parent);
    root = root.parent;
  }

  // find existing node (at root level) by its id
  if (root.nodes) {
    for (i = 0, len = root.nodes.length; i < len; i++) {
      if (node.id === root.nodes[i].id) {
        current = root.nodes[i];
        break;
      }
    }
  }

  if (!current) {
    // this is a new node
    current = {
      id: node.id
    };
    if (graph.node) {
      // clone default attributes
      current.attr = merge(current.attr, graph.node);
    }
  }

  // add node to this (sub)graph and all its parent graphs
  for (i = graphs.length - 1; i >= 0; i--) {
    var g = graphs[i];

    if (!g.nodes) {
      g.nodes = [];
    }
    if (g.nodes.indexOf(current) === -1) {
      g.nodes.push(current);
    }
  }

  // merge attributes
  if (node.attr) {
    current.attr = merge(current.attr, node.attr);
  }
}

/**
 * Add an edge to a graph object
 * @param {Object} graph
 * @param {Object} edge
 */
function addEdge(graph, edge) {
  if (!graph.edges) {
    graph.edges = [];
  }
  graph.edges.push(edge);
  if (graph.edge) {
    var attr = merge({}, graph.edge); // clone default attributes
    edge.attr = merge(attr, edge.attr); // merge attributes
  }
}

/**
 * Create an edge to a graph object
 * @param {Object} graph
 * @param {String | Number | Object} from
 * @param {String | Number | Object} to
 * @param {String} type
 * @param {Object | null} attr
 * @return {Object} edge
 */
function createEdge(graph, from, to, type, attr) {
  var edge = {
    from: from,
    to: to,
    type: type
  };

  if (graph.edge) {
    edge.attr = merge({}, graph.edge); // clone default attributes
  }
  edge.attr = merge(edge.attr || {}, attr); // merge attributes

  return edge;
}

/**
 * Get next token in the current dot file.
 * The token and token type are available as token and tokenType
 */
function getToken() {
  tokenType = TOKENTYPE.NULL;
  token = '';

  // skip over whitespaces
  while (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
    // space, tab, enter
    next();
  }

  do {
    var isComment = false;

    // skip comment
    if (c === '#') {
      // find the previous non-space character
      var i = index - 1;
      while (dot.charAt(i) === ' ' || dot.charAt(i) === '\t') {
        i--;
      }
      if (dot.charAt(i) === '\n' || dot.charAt(i) === '') {
        // the # is at the start of a line, this is indeed a line comment
        while (c != '' && c != '\n') {
          next();
        }
        isComment = true;
      }
    }
    if (c === '/' && nextPreview() === '/') {
      // skip line comment
      while (c != '' && c != '\n') {
        next();
      }
      isComment = true;
    }
    if (c === '/' && nextPreview() === '*') {
      // skip block comment
      while (c != '') {
        if (c === '*' && nextPreview() === '/') {
          // end of block comment found. skip these last two characters
          next();
          next();
          break;
        } else {
          next();
        }
      }
      isComment = true;
    }

    // skip over whitespaces
    while (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      // space, tab, enter
      next();
    }
  } while (isComment);

  // check for end of dot file
  if (c === '') {
    // token is still empty
    tokenType = TOKENTYPE.DELIMITER;
    return;
  }

  // check for delimiters consisting of 2 characters
  var c2 = c + nextPreview();
  if (DELIMITERS[c2]) {
    tokenType = TOKENTYPE.DELIMITER;
    token = c2;
    next();
    next();
    return;
  }

  // check for delimiters consisting of 1 character
  if (DELIMITERS[c]) {
    tokenType = TOKENTYPE.DELIMITER;
    token = c;
    next();
    return;
  }

  // check for an identifier (number or string)
  // TODO: more precise parsing of numbers/strings (and the port separator ':')
  if (isAlphaNumeric(c) || c === '-') {
    token += c;
    next();

    while (isAlphaNumeric(c)) {
      token += c;
      next();
    }
    if (token === 'false') {
      token = false; // convert to boolean
    } else if (token === 'true') {
        token = true; // convert to boolean
      } else if (!isNaN(Number(token))) {
          token = Number(token); // convert to number
        }
    tokenType = TOKENTYPE.IDENTIFIER;
    return;
  }

  // check for a string enclosed by double quotes
  if (c === '"') {
    next();
    while (c != '' && (c != '"' || c === '"' && nextPreview() === '"')) {
      token += c;
      if (c === '"') {
        // skip the escape character
        next();
      }
      next();
    }
    if (c != '"') {
      throw newSyntaxError('End of string " expected');
    }
    next();
    tokenType = TOKENTYPE.IDENTIFIER;
    return;
  }

  // something unknown is found, wrong characters, a syntax error
  tokenType = TOKENTYPE.UNKNOWN;
  while (c != '') {
    token += c;
    next();
  }
  throw new SyntaxError('Syntax error in part "' + chop(token, 30) + '"');
}

/**
 * Parse a graph.
 * @returns {Object} graph
 */
function parseGraph() {
  var graph = {};

  first();
  getToken();

  // optional strict keyword
  if (token === 'strict') {
    graph.strict = true;
    getToken();
  }

  // graph or digraph keyword
  if (token === 'graph' || token === 'digraph') {
    graph.type = token;
    getToken();
  }

  // optional graph id
  if (tokenType === TOKENTYPE.IDENTIFIER) {
    graph.id = token;
    getToken();
  }

  // open angle bracket
  if (token != '{') {
    throw newSyntaxError('Angle bracket { expected');
  }
  getToken();

  // statements
  parseStatements(graph);

  // close angle bracket
  if (token != '}') {
    throw newSyntaxError('Angle bracket } expected');
  }
  getToken();

  // end of file
  if (token !== '') {
    throw newSyntaxError('End of file expected');
  }
  getToken();

  // remove temporary default options
  delete graph.node;
  delete graph.edge;
  delete graph.graph;

  return graph;
}

/**
 * Parse a list with statements.
 * @param {Object} graph
 */
function parseStatements(graph) {
  while (token !== '' && token != '}') {
    parseStatement(graph);
    if (token === ';') {
      getToken();
    }
  }
}

/**
 * Parse a single statement. Can be a an attribute statement, node
 * statement, a series of node statements and edge statements, or a
 * parameter.
 * @param {Object} graph
 */
function parseStatement(graph) {
  // parse subgraph
  var subgraph = parseSubgraph(graph);
  if (subgraph) {
    // edge statements
    parseEdge(graph, subgraph);

    return;
  }

  // parse an attribute statement
  var attr = parseAttributeStatement(graph);
  if (attr) {
    return;
  }

  // parse node
  if (tokenType != TOKENTYPE.IDENTIFIER) {
    throw newSyntaxError('Identifier expected');
  }
  var id = token; // id can be a string or a number
  getToken();

  if (token === '=') {
    // id statement
    getToken();
    if (tokenType != TOKENTYPE.IDENTIFIER) {
      throw newSyntaxError('Identifier expected');
    }
    graph[id] = token;
    getToken();
    // TODO: implement comma separated list with "a_list: ID=ID [','] [a_list] "
  } else {
      parseNodeStatement(graph, id);
    }
}

/**
 * Parse a subgraph
 * @param {Object} graph    parent graph object
 * @return {Object | null} subgraph
 */
function parseSubgraph(graph) {
  var subgraph = null;

  // optional subgraph keyword
  if (token === 'subgraph') {
    subgraph = {};
    subgraph.type = 'subgraph';
    getToken();

    // optional graph id
    if (tokenType === TOKENTYPE.IDENTIFIER) {
      subgraph.id = token;
      getToken();
    }
  }

  // open angle bracket
  if (token === '{') {
    getToken();

    if (!subgraph) {
      subgraph = {};
    }
    subgraph.parent = graph;
    subgraph.node = graph.node;
    subgraph.edge = graph.edge;
    subgraph.graph = graph.graph;

    // statements
    parseStatements(subgraph);

    // close angle bracket
    if (token != '}') {
      throw newSyntaxError('Angle bracket } expected');
    }
    getToken();

    // remove temporary default options
    delete subgraph.node;
    delete subgraph.edge;
    delete subgraph.graph;
    delete subgraph.parent;

    // register at the parent graph
    if (!graph.subgraphs) {
      graph.subgraphs = [];
    }
    graph.subgraphs.push(subgraph);
  }

  return subgraph;
}

/**
 * parse an attribute statement like "node [shape=circle fontSize=16]".
 * Available keywords are 'node', 'edge', 'graph'.
 * The previous list with default attributes will be replaced
 * @param {Object} graph
 * @returns {String | null} keyword Returns the name of the parsed attribute
 *                                  (node, edge, graph), or null if nothing
 *                                  is parsed.
 */
function parseAttributeStatement(graph) {
  // attribute statements
  if (token === 'node') {
    getToken();

    // node attributes
    graph.node = parseAttributeList();
    return 'node';
  } else if (token === 'edge') {
    getToken();

    // edge attributes
    graph.edge = parseAttributeList();
    return 'edge';
  } else if (token === 'graph') {
    getToken();

    // graph attributes
    graph.graph = parseAttributeList();
    return 'graph';
  }

  return null;
}

/**
 * parse a node statement
 * @param {Object} graph
 * @param {String | Number} id
 */
function parseNodeStatement(graph, id) {
  // node statement
  var node = {
    id: id
  };
  var attr = parseAttributeList();
  if (attr) {
    node.attr = attr;
  }
  addNode(graph, node);

  // edge statements
  parseEdge(graph, id);
}

/**
 * Parse an edge or a series of edges
 * @param {Object} graph
 * @param {String | Number} from        Id of the from node
 */
function parseEdge(graph, from) {
  while (token === '->' || token === '--') {
    var to;
    var type = token;
    getToken();

    var subgraph = parseSubgraph(graph);
    if (subgraph) {
      to = subgraph;
    } else {
      if (tokenType != TOKENTYPE.IDENTIFIER) {
        throw newSyntaxError('Identifier or subgraph expected');
      }
      to = token;
      addNode(graph, {
        id: to
      });
      getToken();
    }

    // parse edge attributes
    var attr = parseAttributeList();

    // create edge
    var edge = createEdge(graph, from, to, type, attr);
    addEdge(graph, edge);

    from = to;
  }
}

/**
 * Parse a set with attributes,
 * for example [label="1.000", shape=solid]
 * @return {Object | null} attr
 */
function parseAttributeList() {
  var attr = null;

  while (token === '[') {
    getToken();
    attr = {};
    while (token !== '' && token != ']') {
      if (tokenType != TOKENTYPE.IDENTIFIER) {
        throw newSyntaxError('Attribute name expected');
      }
      var name = token;

      getToken();
      if (token != '=') {
        throw newSyntaxError('Equal sign = expected');
      }
      getToken();

      if (tokenType != TOKENTYPE.IDENTIFIER) {
        throw newSyntaxError('Attribute value expected');
      }
      var value = token;
      setValue(attr, name, value); // name can be a path

      getToken();
      if (token == ',') {
        getToken();
      }
    }

    if (token != ']') {
      throw newSyntaxError('Bracket ] expected');
    }
    getToken();
  }

  return attr;
}

/**
 * Create a syntax error with extra information on current token and index.
 * @param {String} message
 * @returns {SyntaxError} err
 */
function newSyntaxError(message) {
  return new SyntaxError(message + ', got "' + chop(token, 30) + '" (char ' + index + ')');
}

/**
 * Chop off text after a maximum length
 * @param {String} text
 * @param {Number} maxLength
 * @returns {String}
 */
function chop(text, maxLength) {
  return text.length <= maxLength ? text : text.substr(0, maxLength) + '...';
}

/**
 * Execute a function fn for each pair of elements in two arrays
 * @param {Array | *} array1
 * @param {Array | *} array2
 * @param {function} fn
 */
function forEach2(array1, array2, fn) {
  if (Array.isArray(array1)) {
    array1.forEach(function (elem1) {
      if (Array.isArray(array2)) {
        array2.forEach(function (elem2) {
          fn(elem1, elem2);
        });
      } else {
        fn(elem1, array2);
      }
    });
  } else {
    if (Array.isArray(array2)) {
      array2.forEach(function (elem2) {
        fn(array1, elem2);
      });
    } else {
      fn(array1, array2);
    }
  }
}

/**
 * Set a nested property on an object
 * When nested objects are missing, they will be created.
 * For example setProp({}, 'font.color', 'red') will return {font: {color: 'red'}}
 * @param {Object} object
 * @param {string} path   A dot separated string like 'font.color'
 * @param {*} value       Value for the property
 * @return {Object} Returns the original object, allows for chaining.
 */
function setProp(object, path, value) {
  var names = path.split('.');
  var prop = names.pop();

  // traverse over the nested objects
  var obj = object;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (!(name in obj)) {
      obj[name] = {};
    }
    obj = obj[name];
  }

  // set the property value
  obj[prop] = value;

  return object;
}

/**
 * Convert an object with DOT attributes to their vis.js equivalents.
 * @param {Object} attr     Object with DOT attributes
 * @param {Object} mapping
 * @return {Object}         Returns an object with vis.js attributes
 */
function convertAttr(attr, mapping) {
  var converted = {};

  for (var prop in attr) {
    if (attr.hasOwnProperty(prop)) {
      var visProp = mapping[prop];
      if (Array.isArray(visProp)) {
        visProp.forEach(function (visPropI) {
          setProp(converted, visPropI, attr[prop]);
        });
      } else if (typeof visProp === 'string') {
        setProp(converted, visProp, attr[prop]);
      } else {
        setProp(converted, prop, attr[prop]);
      }
    }
  }

  return converted;
}

/**
 * Convert a string containing a graph in DOT language into a map containing
 * with nodes and edges in the format of graph.
 * @param {String} data         Text containing a graph in DOT-notation
 * @return {Object} graphData
 */
function DOTToGraph(data) {
  // parse the DOT file
  var dotData = parseDOT(data);
  var graphData = {
    nodes: [],
    edges: [],
    options: {}
  };

  // copy the nodes
  if (dotData.nodes) {
    dotData.nodes.forEach(function (dotNode) {
      var graphNode = {
        id: dotNode.id,
        label: String(dotNode.label || dotNode.id)
      };
      merge(graphNode, convertAttr(dotNode.attr, NODE_ATTR_MAPPING));
      if (graphNode.image) {
        graphNode.shape = 'image';
      }
      graphData.nodes.push(graphNode);
    });
  }

  // copy the edges
  if (dotData.edges) {
    /**
     * Convert an edge in DOT format to an edge with VisGraph format
     * @param {Object} dotEdge
     * @returns {Object} graphEdge
     */
    var convertEdge = function convertEdge(dotEdge) {
      var graphEdge = {
        from: dotEdge.from,
        to: dotEdge.to
      };
      merge(graphEdge, convertAttr(dotEdge.attr, EDGE_ATTR_MAPPING));
      graphEdge.arrows = dotEdge.type === '->' ? 'to' : undefined;

      return graphEdge;
    };

    dotData.edges.forEach(function (dotEdge) {
      var from, to;
      if (dotEdge.from instanceof Object) {
        from = dotEdge.from.nodes;
      } else {
        from = {
          id: dotEdge.from
        };
      }

      // TODO: support of solid/dotted/dashed edges (attr = 'style')
      // TODO: support for attributes 'dir' and 'arrowhead' (edge arrows)

      if (dotEdge.to instanceof Object) {
        to = dotEdge.to.nodes;
      } else {
        to = {
          id: dotEdge.to
        };
      }

      if (dotEdge.from instanceof Object && dotEdge.from.edges) {
        dotEdge.from.edges.forEach(function (subEdge) {
          var graphEdge = convertEdge(subEdge);
          graphData.edges.push(graphEdge);
        });
      }

      forEach2(from, to, function (from, to) {
        var subEdge = createEdge(graphData, from.id, to.id, dotEdge.type, dotEdge.attr);
        var graphEdge = convertEdge(subEdge);
        graphData.edges.push(graphEdge);
      });

      if (dotEdge.to instanceof Object && dotEdge.to.edges) {
        dotEdge.to.edges.forEach(function (subEdge) {
          var graphEdge = convertEdge(subEdge);
          graphData.edges.push(graphEdge);
        });
      }
    });
  }

  // copy the options
  if (dotData.attr) {
    graphData.options = dotData.attr;
  }

  return graphData;
}

// exports
exports.parseDOT = parseDOT;
exports.DOTToGraph = DOTToGraph;

},{}],13:[function(require,module,exports){
'use strict';

function parseGephi(gephiJSON, optionsObj) {
  var edges = [];
  var nodes = [];
  var options = {
    edges: {
      inheritColor: false
    },
    nodes: {
      fixed: false,
      parseColor: false
    }
  };

  if (optionsObj !== undefined) {
    if (optionsObj.fixed !== undefined) {
      options.nodes.fixed = optionsObj.fixed;
    }
    if (optionsObj.parseColor !== undefined) {
      options.nodes.parseColor = optionsObj.parseColor;
    }
    if (optionsObj.inheritColor !== undefined) {
      options.edges.inheritColor = optionsObj.inheritColor;
    }
  }

  var gEdges = gephiJSON.edges;
  var gNodes = gephiJSON.nodes;
  for (var i = 0; i < gEdges.length; i++) {
    var edge = {};
    var gEdge = gEdges[i];
    edge['id'] = gEdge.id;
    edge['from'] = gEdge.source;
    edge['to'] = gEdge.target;
    edge['attributes'] = gEdge.attributes;
    edge['label'] = gEdge.label;
    edge['title'] = gEdge.attributes !== undefined ? gEdge.attributes.title : undefined;
    if (gEdge['type'] === 'Directed') {
      edge['arrows'] = 'to';
    }
    //    edge['value'] = gEdge.attributes !== undefined ? gEdge.attributes.Weight : undefined;
    //    edge['width'] = edge['value'] !== undefined ? undefined : edgegEdge.size;
    if (gEdge.color && options.inheritColor === false) {
      edge['color'] = gEdge.color;
    }
    edges.push(edge);
  }

  for (var i = 0; i < gNodes.length; i++) {
    var node = {};
    var gNode = gNodes[i];
    node['id'] = gNode.id;
    node['attributes'] = gNode.attributes;
    node['title'] = gNode.title;
    node['x'] = gNode.x;
    node['y'] = gNode.y;
    node['label'] = gNode.label;
    node['title'] = gNode.attributes !== undefined ? gNode.attributes.title : undefined;
    if (options.nodes.parseColor === true) {
      node['color'] = gNode.color;
    } else {
      node['color'] = gNode.color !== undefined ? { background: gNode.color, border: gNode.color, highlight: { background: gNode.color, border: gNode.color }, hover: { background: gNode.color, border: gNode.color } } : undefined;
    }
    node['size'] = gNode.size;
    node['fixed'] = options.nodes.fixed && gNode.x !== undefined && gNode.y !== undefined;
    nodes.push(node);
  }

  return { nodes: nodes, edges: edges };
}

exports.parseGephi = parseGephi;

},{}],14:[function(require,module,exports){
// English
'use strict';

exports['en'] = {
  edit: 'Edit',
  del: 'Delete selected',
  back: 'Back',
  addNode: 'Add Node',
  addEdge: 'Add Edge',
  editNode: 'Edit Node',
  editEdge: 'Edit Edge',
  addDescription: 'Click in an empty space to place a new node.',
  edgeDescription: 'Click on a node and drag the edge to another node to connect them.',
  editEdgeDescription: 'Click on the control points and drag them to a node to connect to it.',
  createEdgeError: 'Cannot link edges to a cluster.',
  deleteClusterError: 'Clusters cannot be deleted.',
  editClusterError: 'Clusters cannot be edited.'
};
exports['en_EN'] = exports['en'];
exports['en_US'] = exports['en'];

// German
exports['de'] = {
  edit: 'Editieren',
  del: 'Lösche Auswahl',
  back: 'Zurück',
  addNode: 'Knoten hinzufügen',
  addEdge: 'Kante hinzufügen',
  editNode: 'Knoten editieren',
  editEdge: 'Kante editieren',
  addDescription: 'Klicke auf eine freie Stelle, um einen neuen Knoten zu plazieren.',
  edgeDescription: 'Klicke auf einen Knoten und ziehe die Kante zu einem anderen Knoten, um diese zu verbinden.',
  editEdgeDescription: 'Klicke auf die Verbindungspunkte und ziehe diese auf einen Knoten, um sie zu verbinden.',
  createEdgeError: 'Es ist nicht möglich, Kanten mit Clustern zu verbinden.',
  deleteClusterError: 'Cluster können nicht gelöscht werden.',
  editClusterError: 'Cluster können nicht editiert werden.'
};
exports['de_DE'] = exports['de'];

// Spanish
exports['es'] = {
  edit: 'Editar',
  del: 'Eliminar selección',
  back: 'Átras',
  addNode: 'Añadir nodo',
  addEdge: 'Añadir arista',
  editNode: 'Editar nodo',
  editEdge: 'Editar arista',
  addDescription: 'Haga clic en un lugar vacío para colocar un nuevo nodo.',
  edgeDescription: 'Haga clic en un nodo y arrastre la arista hacia otro nodo para conectarlos.',
  editEdgeDescription: 'Haga clic en un punto de control y arrastrelo a un nodo para conectarlo.',
  createEdgeError: 'No se puede conectar una arista a un grupo.',
  deleteClusterError: 'No es posible eliminar grupos.',
  editClusterError: 'No es posible editar grupos.'
};
exports['es_ES'] = exports['es'];

// Dutch
exports['nl'] = {
  edit: 'Wijzigen',
  del: 'Selectie verwijderen',
  back: 'Terug',
  addNode: 'Node toevoegen',
  addEdge: 'Link toevoegen',
  editNode: 'Node wijzigen',
  editEdge: 'Link wijzigen',
  addDescription: 'Klik op een leeg gebied om een nieuwe node te maken.',
  edgeDescription: 'Klik op een node en sleep de link naar een andere node om ze te verbinden.',
  editEdgeDescription: 'Klik op de verbindingspunten en sleep ze naar een node om daarmee te verbinden.',
  createEdgeError: 'Kan geen link maken naar een cluster.',
  deleteClusterError: 'Clusters kunnen niet worden verwijderd.',
  editClusterError: 'Clusters kunnen niet worden aangepast.'
};
exports['nl_NL'] = exports['nl'];
exports['nl_BE'] = exports['nl'];

},{}],15:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Hammer = require('../../module/hammer');
var hammerUtil = require('../../hammerUtil');

var util = require('../../util');

/**
 * Create the main frame for the Network.
 * This function is executed once when a Network object is created. The frame
 * contains a canvas, and this canvas contains all objects like the axis and
 * nodes.
 * @private
 */

var Canvas = (function () {
  function Canvas(body) {
    _classCallCheck(this, Canvas);

    this.body = body;
    this.pixelRatio = 1;
    this.resizeTimer = undefined;
    this.resizeFunction = this._onResize.bind(this);
    this.cameraState = {};

    this.options = {};
    this.defaultOptions = {
      autoResize: true,
      height: '100%',
      width: '100%'
    };
    util.extend(this.options, this.defaultOptions);

    this.bindEventListeners();
  }

  _createClass(Canvas, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this = this;

      // bind the events
      this.body.emitter.once("resize", function (obj) {
        if (obj.width !== 0) {
          _this.body.view.translation.x = obj.width * 0.5;
        }
        if (obj.height !== 0) {
          _this.body.view.translation.y = obj.height * 0.5;
        }
      });
      this.body.emitter.on("setSize", this.setSize.bind(this));
      this.body.emitter.on("destroy", function () {
        _this.hammerFrame.destroy();
        _this.hammer.destroy();
        _this._cleanUp();
      });
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      var _this2 = this;

      if (options !== undefined) {
        var fields = ['width', 'height', 'autoResize'];
        util.selectiveDeepExtend(fields, this.options, options);
      }

      if (this.options.autoResize === true) {
        // automatically adapt to a changing size of the browser.
        this._cleanUp();
        this.resizeTimer = setInterval(function () {
          var changed = _this2.setSize();
          if (changed === true) {
            _this2.body.emitter.emit("_requestRedraw");
          }
        }, 1000);
        this.resizeFunction = this._onResize.bind(this);
        util.addEventListener(window, 'resize', this.resizeFunction);
      }
    }
  }, {
    key: '_cleanUp',
    value: function _cleanUp() {
      // automatically adapt to a changing size of the browser.
      if (this.resizeTimer !== undefined) {
        clearInterval(this.resizeTimer);
      }
      util.removeEventListener(window, 'resize', this.resizeFunction);
      this.resizeFunction = undefined;
    }
  }, {
    key: '_onResize',
    value: function _onResize() {
      this.setSize();
      this.body.emitter.emit("_redraw");
    }

    /**
     * Get and store the cameraState
     * @private
     */
  }, {
    key: '_getCameraState',
    value: function _getCameraState() {
      var pixelRatio = arguments.length <= 0 || arguments[0] === undefined ? this.pixelRatio : arguments[0];

      this.cameraState.previousWidth = this.frame.canvas.width / pixelRatio;
      this.cameraState.previousHeight = this.frame.canvas.height / pixelRatio;
      this.cameraState.scale = this.body.view.scale;
      this.cameraState.position = this.DOMtoCanvas({ x: 0.5 * this.frame.canvas.width / pixelRatio, y: 0.5 * this.frame.canvas.height / pixelRatio });
    }

    /**
     * Set the cameraState
     * @private
     */
  }, {
    key: '_setCameraState',
    value: function _setCameraState() {
      if (this.cameraState.scale !== undefined && this.frame.canvas.clientWidth !== 0 && this.frame.canvas.clientHeight !== 0 && this.pixelRatio !== 0 && this.cameraState.previousWidth > 0) {

        this.body.view.scale = this.cameraState.scale * Math.min(this.frame.canvas.width / this.pixelRatio / this.cameraState.previousWidth, this.frame.canvas.height / this.pixelRatio / this.cameraState.previousHeight);

        // this comes from the view module.
        var currentViewCenter = this.DOMtoCanvas({
          x: 0.5 * this.frame.canvas.clientWidth,
          y: 0.5 * this.frame.canvas.clientHeight
        });

        var distanceFromCenter = { // offset from view, distance view has to change by these x and y to center the node
          x: currentViewCenter.x - this.cameraState.position.x,
          y: currentViewCenter.y - this.cameraState.position.y
        };
        this.body.view.translation.x += distanceFromCenter.x * this.body.view.scale;
        this.body.view.translation.y += distanceFromCenter.y * this.body.view.scale;
      }
    }
  }, {
    key: '_prepareValue',
    value: function _prepareValue(value) {
      if (typeof value === 'number') {
        return value + 'px';
      } else if (typeof value === 'string') {
        if (value.indexOf('%') !== -1 || value.indexOf('px') !== -1) {
          return value;
        } else if (value.indexOf('%') === -1) {
          return value + 'px';
        }
      }
      throw new Error('Could not use the value supplied for width or height:' + value);
    }

    /**
     * Create the HTML
     */
  }, {
    key: '_create',
    value: function _create() {
      // remove all elements from the container element.
      while (this.body.container.hasChildNodes()) {
        this.body.container.removeChild(this.body.container.firstChild);
      }

      this.frame = document.createElement('div');
      this.frame.className = 'vis-network';
      this.frame.style.position = 'relative';
      this.frame.style.overflow = 'hidden';
      this.frame.tabIndex = 900; // tab index is required for keycharm to bind keystrokes to the div instead of the window

      //////////////////////////////////////////////////////////////////

      this.frame.canvas = document.createElement("canvas");
      this.frame.canvas.style.position = 'relative';
      this.frame.appendChild(this.frame.canvas);

      if (!this.frame.canvas.getContext) {
        var noCanvas = document.createElement('DIV');
        noCanvas.style.color = 'red';
        noCanvas.style.fontWeight = 'bold';
        noCanvas.style.padding = '10px';
        noCanvas.innerHTML = 'Error: your browser does not support HTML canvas';
        this.frame.canvas.appendChild(noCanvas);
      } else {
        var ctx = this.frame.canvas.getContext("2d");
        this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);

        this.frame.canvas.getContext("2d").setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      }

      // add the frame to the container element
      this.body.container.appendChild(this.frame);

      this.body.view.scale = 1;
      this.body.view.translation = { x: 0.5 * this.frame.canvas.clientWidth, y: 0.5 * this.frame.canvas.clientHeight };

      this._bindHammer();
    }

    /**
     * This function binds hammer, it can be repeated over and over due to the uniqueness check.
     * @private
     */
  }, {
    key: '_bindHammer',
    value: function _bindHammer() {
      var _this3 = this;

      if (this.hammer !== undefined) {
        this.hammer.destroy();
      }
      this.drag = {};
      this.pinch = {};

      // init hammer
      this.hammer = new Hammer(this.frame.canvas);
      this.hammer.get('pinch').set({ enable: true });
      // enable to get better response, todo: test on mobile.
      this.hammer.get('pan').set({ threshold: 5, direction: 30 }); // 30 is ALL_DIRECTIONS in hammer.

      hammerUtil.onTouch(this.hammer, function (event) {
        _this3.body.eventListeners.onTouch(event);
      });
      this.hammer.on('tap', function (event) {
        _this3.body.eventListeners.onTap(event);
      });
      this.hammer.on('doubletap', function (event) {
        _this3.body.eventListeners.onDoubleTap(event);
      });
      this.hammer.on('press', function (event) {
        _this3.body.eventListeners.onHold(event);
      });
      this.hammer.on('panstart', function (event) {
        _this3.body.eventListeners.onDragStart(event);
      });
      this.hammer.on('panmove', function (event) {
        _this3.body.eventListeners.onDrag(event);
      });
      this.hammer.on('panend', function (event) {
        _this3.body.eventListeners.onDragEnd(event);
      });
      this.hammer.on('pinch', function (event) {
        _this3.body.eventListeners.onPinch(event);
      });

      // TODO: neatly cleanup these handlers when re-creating the Canvas, IF these are done with hammer, event.stopPropagation will not work?
      this.frame.canvas.addEventListener('mousewheel', function (event) {
        _this3.body.eventListeners.onMouseWheel(event);
      });
      this.frame.canvas.addEventListener('DOMMouseScroll', function (event) {
        _this3.body.eventListeners.onMouseWheel(event);
      });

      this.frame.canvas.addEventListener('mousemove', function (event) {
        _this3.body.eventListeners.onMouseMove(event);
      });
      this.frame.canvas.addEventListener('contextmenu', function (event) {
        _this3.body.eventListeners.onContext(event);
      });

      this.hammerFrame = new Hammer(this.frame);
      hammerUtil.onRelease(this.hammerFrame, function (event) {
        _this3.body.eventListeners.onRelease(event);
      });
    }

    /**
     * Set a new size for the network
     * @param {string} width   Width in pixels or percentage (for example '800px'
     *                         or '50%')
     * @param {string} height  Height in pixels or percentage  (for example '400px'
     *                         or '30%')
     */
  }, {
    key: 'setSize',
    value: function setSize() {
      var width = arguments.length <= 0 || arguments[0] === undefined ? this.options.width : arguments[0];
      var height = arguments.length <= 1 || arguments[1] === undefined ? this.options.height : arguments[1];

      width = this._prepareValue(width);
      height = this._prepareValue(height);

      var emitEvent = false;
      var oldWidth = this.frame.canvas.width;
      var oldHeight = this.frame.canvas.height;

      // update the pixelratio
      var ctx = this.frame.canvas.getContext("2d");
      var previousRation = this.pixelRatio; // we cache this because the camera state storage needs the old value
      this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);

      if (width != this.options.width || height != this.options.height || this.frame.style.width != width || this.frame.style.height != height) {
        this._getCameraState(previousRation);

        this.frame.style.width = width;
        this.frame.style.height = height;

        this.frame.canvas.style.width = '100%';
        this.frame.canvas.style.height = '100%';

        this.frame.canvas.width = Math.round(this.frame.canvas.clientWidth * this.pixelRatio);
        this.frame.canvas.height = Math.round(this.frame.canvas.clientHeight * this.pixelRatio);

        this.options.width = width;
        this.options.height = height;

        emitEvent = true;
      } else {
        // this would adapt the width of the canvas to the width from 100% if and only if
        // there is a change.

        // store the camera if there is a change in size.
        if (this.frame.canvas.width != Math.round(this.frame.canvas.clientWidth * this.pixelRatio) || this.frame.canvas.height != Math.round(this.frame.canvas.clientHeight * this.pixelRatio)) {
          this._getCameraState(previousRation);
        }

        if (this.frame.canvas.width != Math.round(this.frame.canvas.clientWidth * this.pixelRatio)) {
          this.frame.canvas.width = Math.round(this.frame.canvas.clientWidth * this.pixelRatio);
          emitEvent = true;
        }
        if (this.frame.canvas.height != Math.round(this.frame.canvas.clientHeight * this.pixelRatio)) {
          this.frame.canvas.height = Math.round(this.frame.canvas.clientHeight * this.pixelRatio);
          emitEvent = true;
        }
      }

      if (emitEvent === true) {
        this.body.emitter.emit('resize', {
          width: Math.round(this.frame.canvas.width / this.pixelRatio),
          height: Math.round(this.frame.canvas.height / this.pixelRatio),
          oldWidth: Math.round(oldWidth / this.pixelRatio),
          oldHeight: Math.round(oldHeight / this.pixelRatio)
        });

        // restore the camera on change.
        this._setCameraState();
      }

      return emitEvent;
    }
  }, {
    key: '_XconvertDOMtoCanvas',

    /**
     * Convert the X coordinate in DOM-space (coordinate point in browser relative to the container div) to
     * the X coordinate in canvas-space (the simulation sandbox, which the camera looks upon)
     * @param {number} x
     * @returns {number}
     * @private
     */
    value: function _XconvertDOMtoCanvas(x) {
      return (x - this.body.view.translation.x) / this.body.view.scale;
    }

    /**
     * Convert the X coordinate in canvas-space (the simulation sandbox, which the camera looks upon) to
     * the X coordinate in DOM-space (coordinate point in browser relative to the container div)
     * @param {number} x
     * @returns {number}
     * @private
     */
  }, {
    key: '_XconvertCanvasToDOM',
    value: function _XconvertCanvasToDOM(x) {
      return x * this.body.view.scale + this.body.view.translation.x;
    }

    /**
     * Convert the Y coordinate in DOM-space (coordinate point in browser relative to the container div) to
     * the Y coordinate in canvas-space (the simulation sandbox, which the camera looks upon)
     * @param {number} y
     * @returns {number}
     * @private
     */
  }, {
    key: '_YconvertDOMtoCanvas',
    value: function _YconvertDOMtoCanvas(y) {
      return (y - this.body.view.translation.y) / this.body.view.scale;
    }

    /**
     * Convert the Y coordinate in canvas-space (the simulation sandbox, which the camera looks upon) to
     * the Y coordinate in DOM-space (coordinate point in browser relative to the container div)
     * @param {number} y
     * @returns {number}
     * @private
     */
  }, {
    key: '_YconvertCanvasToDOM',
    value: function _YconvertCanvasToDOM(y) {
      return y * this.body.view.scale + this.body.view.translation.y;
    }

    /**
     *
     * @param {object} pos   = {x: number, y: number}
     * @returns {{x: number, y: number}}
     * @constructor
     */
  }, {
    key: 'canvasToDOM',
    value: function canvasToDOM(pos) {
      return { x: this._XconvertCanvasToDOM(pos.x), y: this._YconvertCanvasToDOM(pos.y) };
    }

    /**
     *
     * @param {object} pos   = {x: number, y: number}
     * @returns {{x: number, y: number}}
     * @constructor
     */
  }, {
    key: 'DOMtoCanvas',
    value: function DOMtoCanvas(pos) {
      return { x: this._XconvertDOMtoCanvas(pos.x), y: this._YconvertDOMtoCanvas(pos.y) };
    }
  }]);

  return Canvas;
})();

exports['default'] = Canvas;
module.exports = exports['default'];

},{"../../hammerUtil":5,"../../module/hammer":6,"../../util":73}],16:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

if (typeof window !== 'undefined') {
  window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
}

var util = require('../../util');

var CanvasRenderer = (function () {
  function CanvasRenderer(body, canvas) {
    _classCallCheck(this, CanvasRenderer);

    this.body = body;
    this.canvas = canvas;

    this.redrawRequested = false;
    this.renderTimer = undefined;
    this.requiresTimeout = true;
    this.renderingActive = false;
    this.renderRequests = 0;
    this.pixelRatio = undefined;
    this.allowRedraw = true;

    this.dragging = false;
    this.options = {};
    this.defaultOptions = {
      hideEdgesOnDrag: false,
      hideNodesOnDrag: false
    };
    util.extend(this.options, this.defaultOptions);

    this._determineBrowserMethod();
    this.bindEventListeners();
  }

  _createClass(CanvasRenderer, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this = this;

      this.body.emitter.on("dragStart", function () {
        _this.dragging = true;
      });
      this.body.emitter.on("dragEnd", function () {
        return _this.dragging = false;
      });
      this.body.emitter.on("_resizeNodes", function () {
        return _this._resizeNodes();
      });
      this.body.emitter.on("_redraw", function () {
        if (_this.renderingActive === false) {
          _this._redraw();
        }
      });
      this.body.emitter.on("_blockRedraw", function () {
        _this.allowRedraw = false;
      });
      this.body.emitter.on("_allowRedraw", function () {
        _this.allowRedraw = true;_this.redrawRequested = false;
      });
      this.body.emitter.on("_requestRedraw", this._requestRedraw.bind(this));
      this.body.emitter.on("_startRendering", function () {
        _this.renderRequests += 1;
        _this.renderingActive = true;
        _this._startRendering();
      });
      this.body.emitter.on("_stopRendering", function () {
        _this.renderRequests -= 1;
        _this.renderingActive = _this.renderRequests > 0;
        _this.renderTimer = undefined;
      });
      this.body.emitter.on('destroy', function () {
        _this.renderRequests = 0;
        _this.allowRedraw = false;
        _this.renderingActive = false;
        if (_this.requiresTimeout === true) {
          clearTimeout(_this.renderTimer);
        } else {
          cancelAnimationFrame(_this.renderTimer);
        }
        _this.body.emitter.off();
      });
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        var fields = ['hideEdgesOnDrag', 'hideNodesOnDrag'];
        util.selectiveDeepExtend(fields, this.options, options);
      }
    }
  }, {
    key: '_startRendering',
    value: function _startRendering() {
      if (this.renderingActive === true) {
        if (this.renderTimer === undefined) {
          if (this.requiresTimeout === true) {
            this.renderTimer = window.setTimeout(this._renderStep.bind(this), this.simulationInterval); // wait this.renderTimeStep milliseconds and perform the animation step function
          } else {
              this.renderTimer = window.requestAnimationFrame(this._renderStep.bind(this)); // wait this.renderTimeStep milliseconds and perform the animation step function
            }
        }
      }
    }
  }, {
    key: '_renderStep',
    value: function _renderStep() {
      if (this.renderingActive === true) {
        // reset the renderTimer so a new scheduled animation step can be set
        this.renderTimer = undefined;

        if (this.requiresTimeout === true) {
          // this schedules a new simulation step
          this._startRendering();
        }

        this._redraw();

        if (this.requiresTimeout === false) {
          // this schedules a new simulation step
          this._startRendering();
        }
      }
    }

    /**
     * Redraw the network with the current data
     * chart will be resized too.
     */
  }, {
    key: 'redraw',
    value: function redraw() {
      this.body.emitter.emit('setSize');
      this._redraw();
    }

    /**
     * Redraw the network with the current data
     * @param hidden | used to get the first estimate of the node sizes. only the nodes are drawn after which they are quickly drawn over.
     * @private
     */
  }, {
    key: '_requestRedraw',
    value: function _requestRedraw() {
      var _this2 = this;

      if (this.redrawRequested !== true && this.renderingActive === false && this.allowRedraw === true) {
        this.redrawRequested = true;
        if (this.requiresTimeout === true) {
          window.setTimeout(function () {
            _this2._redraw(false);
          }, 0);
        } else {
          window.requestAnimationFrame(function () {
            _this2._redraw(false);
          });
        }
      }
    }
  }, {
    key: '_redraw',
    value: function _redraw() {
      var hidden = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

      if (this.allowRedraw === true) {
        this.body.emitter.emit("initRedraw");

        this.redrawRequested = false;
        var ctx = this.canvas.frame.canvas.getContext('2d');

        // when the container div was hidden, this fixes it back up!
        if (this.canvas.frame.canvas.width === 0 || this.canvas.frame.canvas.height === 0) {
          this.canvas.setSize();
        }

        this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);

        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

        // clear the canvas
        var w = this.canvas.frame.canvas.clientWidth;
        var h = this.canvas.frame.canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        // if the div is hidden, we stop the redraw here for performance.
        if (this.canvas.frame.clientWidth === 0) {
          return;
        }

        // set scaling and translation
        ctx.save();
        ctx.translate(this.body.view.translation.x, this.body.view.translation.y);
        ctx.scale(this.body.view.scale, this.body.view.scale);

        ctx.beginPath();
        this.body.emitter.emit("beforeDrawing", ctx);
        ctx.closePath();

        if (hidden === false) {
          if (this.dragging === false || this.dragging === true && this.options.hideEdgesOnDrag === false) {
            this._drawEdges(ctx);
          }
        }

        if (this.dragging === false || this.dragging === true && this.options.hideNodesOnDrag === false) {
          this._drawNodes(ctx, hidden);
        }

        if (this.controlNodesActive === true) {
          this._drawControlNodes(ctx);
        }

        ctx.beginPath();
        this.body.emitter.emit("afterDrawing", ctx);
        ctx.closePath();

        // restore original scaling and translation
        ctx.restore();
        if (hidden === true) {
          ctx.clearRect(0, 0, w, h);
        }
      }
    }

    /**
     * Redraw all nodes
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
     * @param {CanvasRenderingContext2D}   ctx
     * @param {Boolean} [alwaysShow]
     * @private
     */
  }, {
    key: '_resizeNodes',
    value: function _resizeNodes() {
      var ctx = this.canvas.frame.canvas.getContext('2d');
      if (this.pixelRatio === undefined) {
        this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);
      }
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      ctx.save();
      ctx.translate(this.body.view.translation.x, this.body.view.translation.y);
      ctx.scale(this.body.view.scale, this.body.view.scale);

      var nodes = this.body.nodes;
      var node = undefined;

      // resize all nodes
      for (var nodeId in nodes) {
        if (nodes.hasOwnProperty(nodeId)) {
          node = nodes[nodeId];
          node.resize(ctx);
          node.updateBoundingBox(ctx, node.selected);
        }
      }

      // restore original scaling and translation
      ctx.restore();
    }

    /**
     * Redraw all nodes
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
     * @param {CanvasRenderingContext2D}   ctx
     * @param {Boolean} [alwaysShow]
     * @private
     */
  }, {
    key: '_drawNodes',
    value: function _drawNodes(ctx) {
      var alwaysShow = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var nodes = this.body.nodes;
      var nodeIndices = this.body.nodeIndices;
      var node = undefined;
      var selected = [];
      var margin = 20;
      var topLeft = this.canvas.DOMtoCanvas({ x: -margin, y: -margin });
      var bottomRight = this.canvas.DOMtoCanvas({
        x: this.canvas.frame.canvas.clientWidth + margin,
        y: this.canvas.frame.canvas.clientHeight + margin
      });
      var viewableArea = { top: topLeft.y, left: topLeft.x, bottom: bottomRight.y, right: bottomRight.x };

      // draw unselected nodes;
      for (var i = 0; i < nodeIndices.length; i++) {
        node = nodes[nodeIndices[i]];
        // set selected nodes aside
        if (node.isSelected()) {
          selected.push(nodeIndices[i]);
        } else {
          if (alwaysShow === true) {
            node.draw(ctx);
          } else if (node.isBoundingBoxOverlappingWith(viewableArea) === true) {
            node.draw(ctx);
          } else {
            node.updateBoundingBox(ctx, node.selected);
          }
        }
      }

      // draw the selected nodes on top
      for (var i = 0; i < selected.length; i++) {
        node = nodes[selected[i]];
        node.draw(ctx);
      }
    }

    /**
     * Redraw all edges
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
     * @param {CanvasRenderingContext2D}   ctx
     * @private
     */
  }, {
    key: '_drawEdges',
    value: function _drawEdges(ctx) {
      var edges = this.body.edges;
      var edgeIndices = this.body.edgeIndices;
      var edge = undefined;

      for (var i = 0; i < edgeIndices.length; i++) {
        edge = edges[edgeIndices[i]];
        if (edge.connected === true) {
          edge.draw(ctx);
        }
      }
    }

    /**
     * Redraw all edges
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext('2d');
     * @param {CanvasRenderingContext2D}   ctx
     * @private
     */
  }, {
    key: '_drawControlNodes',
    value: function _drawControlNodes(ctx) {
      var edges = this.body.edges;
      var edgeIndices = this.body.edgeIndices;
      var edge = undefined;

      for (var i = 0; i < edgeIndices.length; i++) {
        edge = edges[edgeIndices[i]];
        edge._drawControlNodes(ctx);
      }
    }

    /**
     * Determine if the browser requires a setTimeout or a requestAnimationFrame. This was required because
     * some implementations (safari and IE9) did not support requestAnimationFrame
     * @private
     */
  }, {
    key: '_determineBrowserMethod',
    value: function _determineBrowserMethod() {
      if (typeof window !== 'undefined') {
        var browserType = navigator.userAgent.toLowerCase();
        this.requiresTimeout = false;
        if (browserType.indexOf('msie 9.0') != -1) {
          // IE 9
          this.requiresTimeout = true;
        } else if (browserType.indexOf('safari') != -1) {
          // safari
          if (browserType.indexOf('chrome') <= -1) {
            this.requiresTimeout = true;
          }
        }
      } else {
        this.requiresTimeout = true;
      }
    }
  }]);

  return CanvasRenderer;
})();

exports['default'] = CanvasRenderer;
module.exports = exports['default'];

},{"../../util":73}],17:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _NetworkUtil = require('../NetworkUtil');

var _NetworkUtil2 = _interopRequireDefault(_NetworkUtil);

var _componentsNodesCluster = require('./components/nodes/Cluster');

var _componentsNodesCluster2 = _interopRequireDefault(_componentsNodesCluster);

var util = require("../../util");

var ClusterEngine = (function () {
  function ClusterEngine(body) {
    var _this = this;

    _classCallCheck(this, ClusterEngine);

    this.body = body;
    this.clusteredNodes = {};

    this.options = {};
    this.defaultOptions = {};
    util.extend(this.options, this.defaultOptions);

    this.body.emitter.on('_resetData', function () {
      _this.clusteredNodes = {};
    });
  }

  _createClass(ClusterEngine, [{
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {}
    }

    /**
    *
    * @param hubsize
    * @param options
    */
  }, {
    key: 'clusterByHubsize',
    value: function clusterByHubsize(hubsize, options) {
      if (hubsize === undefined) {
        hubsize = this._getHubSize();
      } else if (typeof hubsize === "object") {
        options = this._checkOptions(hubsize);
        hubsize = this._getHubSize();
      }

      var nodesToCluster = [];
      for (var i = 0; i < this.body.nodeIndices.length; i++) {
        var node = this.body.nodes[this.body.nodeIndices[i]];
        if (node.edges.length >= hubsize) {
          nodesToCluster.push(node.id);
        }
      }

      for (var i = 0; i < nodesToCluster.length; i++) {
        this.clusterByConnection(nodesToCluster[i], options, true);
      }

      this.body.emitter.emit('_dataChanged');
    }

    /**
    * loop over all nodes, check if they adhere to the condition and cluster if needed.
    * @param options
    * @param refreshData
    */
  }, {
    key: 'cluster',
    value: function cluster() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
      var refreshData = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      if (options.joinCondition === undefined) {
        throw new Error("Cannot call clusterByNodeData without a joinCondition function in the options.");
      }

      // check if the options object is fine, append if needed
      options = this._checkOptions(options);

      var childNodesObj = {};
      var childEdgesObj = {};

      // collect the nodes that will be in the cluster
      for (var i = 0; i < this.body.nodeIndices.length; i++) {
        var nodeId = this.body.nodeIndices[i];
        var node = this.body.nodes[nodeId];
        var clonedOptions = _NetworkUtil2['default']._cloneOptions(node);
        if (options.joinCondition(clonedOptions) === true) {
          childNodesObj[nodeId] = this.body.nodes[nodeId];

          // collect the nodes that will be in the cluster
          for (var _i = 0; _i < node.edges.length; _i++) {
            var edge = node.edges[_i];
            if (edge.hiddenByCluster !== true) {
              childEdgesObj[edge.id] = edge;
            }
          }
        }
      }

      this._cluster(childNodesObj, childEdgesObj, options, refreshData);
    }

    /**
     * Cluster all nodes in the network that have only X edges
     * @param edgeCount
     * @param options
     * @param refreshData
     */
  }, {
    key: 'clusterByEdgeCount',
    value: function clusterByEdgeCount(edgeCount, options) {
      var refreshData = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];

      options = this._checkOptions(options);
      var clusters = [];
      var usedNodes = {};
      var edge = undefined,
          edges = undefined,
          node = undefined,
          nodeId = undefined,
          relevantEdgeCount = undefined;
      // collect the nodes that will be in the cluster
      for (var i = 0; i < this.body.nodeIndices.length; i++) {
        var childNodesObj = {};
        var childEdgesObj = {};
        nodeId = this.body.nodeIndices[i];

        // if this node is already used in another cluster this session, we do not have to re-evaluate it.
        if (usedNodes[nodeId] === undefined) {
          relevantEdgeCount = 0;
          node = this.body.nodes[nodeId];
          edges = [];
          for (var j = 0; j < node.edges.length; j++) {
            edge = node.edges[j];
            if (edge.hiddenByCluster !== true) {
              if (edge.toId !== edge.fromId) {
                relevantEdgeCount++;
              }
              edges.push(edge);
            }
          }

          // this node qualifies, we collect its neighbours to start the clustering process.
          if (relevantEdgeCount === edgeCount) {
            var gatheringSuccessful = true;
            for (var j = 0; j < edges.length; j++) {
              edge = edges[j];
              var childNodeId = this._getConnectedId(edge, nodeId);
              // add the nodes to the list by the join condition.
              if (options.joinCondition === undefined) {
                childEdgesObj[edge.id] = edge;
                childNodesObj[nodeId] = this.body.nodes[nodeId];
                childNodesObj[childNodeId] = this.body.nodes[childNodeId];
                usedNodes[nodeId] = true;
              } else {
                var clonedOptions = _NetworkUtil2['default']._cloneOptions(this.body.nodes[nodeId]);
                if (options.joinCondition(clonedOptions) === true) {
                  childEdgesObj[edge.id] = edge;
                  childNodesObj[nodeId] = this.body.nodes[nodeId];
                  usedNodes[nodeId] = true;
                } else {
                  // this node does not qualify after all.
                  gatheringSuccessful = false;
                  break;
                }
              }
            }

            // add to the cluster queue
            if (Object.keys(childNodesObj).length > 0 && Object.keys(childEdgesObj).length > 0 && gatheringSuccessful === true) {
              clusters.push({ nodes: childNodesObj, edges: childEdgesObj });
            }
          }
        }
      }

      for (var i = 0; i < clusters.length; i++) {
        this._cluster(clusters[i].nodes, clusters[i].edges, options, false);
      }

      if (refreshData === true) {
        this.body.emitter.emit('_dataChanged');
      }
    }

    /**
    * Cluster all nodes in the network that have only 1 edge
    * @param options
    * @param refreshData
    */
  }, {
    key: 'clusterOutliers',
    value: function clusterOutliers(options) {
      var refreshData = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      this.clusterByEdgeCount(1, options, refreshData);
    }

    /**
     * Cluster all nodes in the network that have only 2 edge
     * @param options
     * @param refreshData
     */
  }, {
    key: 'clusterBridges',
    value: function clusterBridges(options) {
      var refreshData = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      this.clusterByEdgeCount(2, options, refreshData);
    }

    /**
    * suck all connected nodes of a node into the node.
    * @param nodeId
    * @param options
    * @param refreshData
    */
  }, {
    key: 'clusterByConnection',
    value: function clusterByConnection(nodeId, options) {
      var refreshData = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];

      // kill conditions
      if (nodeId === undefined) {
        throw new Error("No nodeId supplied to clusterByConnection!");
      }
      if (this.body.nodes[nodeId] === undefined) {
        throw new Error("The nodeId given to clusterByConnection does not exist!");
      }

      var node = this.body.nodes[nodeId];
      options = this._checkOptions(options, node);
      if (options.clusterNodeProperties.x === undefined) {
        options.clusterNodeProperties.x = node.x;
      }
      if (options.clusterNodeProperties.y === undefined) {
        options.clusterNodeProperties.y = node.y;
      }
      if (options.clusterNodeProperties.fixed === undefined) {
        options.clusterNodeProperties.fixed = {};
        options.clusterNodeProperties.fixed.x = node.options.fixed.x;
        options.clusterNodeProperties.fixed.y = node.options.fixed.y;
      }

      var childNodesObj = {};
      var childEdgesObj = {};
      var parentNodeId = node.id;
      var parentClonedOptions = _NetworkUtil2['default']._cloneOptions(node);
      childNodesObj[parentNodeId] = node;

      // collect the nodes that will be in the cluster
      for (var i = 0; i < node.edges.length; i++) {
        var edge = node.edges[i];
        if (edge.hiddenByCluster !== true) {
          var childNodeId = this._getConnectedId(edge, parentNodeId);

          // if the child node is not in a cluster (may not be needed now with the edge.hiddenByCluster check)
          if (this.clusteredNodes[childNodeId] === undefined) {
            if (childNodeId !== parentNodeId) {
              if (options.joinCondition === undefined) {
                childEdgesObj[edge.id] = edge;
                childNodesObj[childNodeId] = this.body.nodes[childNodeId];
              } else {
                // clone the options and insert some additional parameters that could be interesting.
                var childClonedOptions = _NetworkUtil2['default']._cloneOptions(this.body.nodes[childNodeId]);
                if (options.joinCondition(parentClonedOptions, childClonedOptions) === true) {
                  childEdgesObj[edge.id] = edge;
                  childNodesObj[childNodeId] = this.body.nodes[childNodeId];
                }
              }
            } else {
              // swallow the edge if it is self-referencing.
              childEdgesObj[edge.id] = edge;
            }
          }
        }
      }

      this._cluster(childNodesObj, childEdgesObj, options, refreshData);
    }

    /**
    * This function creates the edges that will be attached to the cluster
    * It looks for edges that are connected to the nodes from the "outside' of the cluster.
    *
    * @param childNodesObj
    * @param newEdges
    * @param options
    * @private
    */
  }, {
    key: '_createClusterEdges',
    value: function _createClusterEdges(childNodesObj, childEdgesObj, clusterNodeProperties, clusterEdgeProperties) {
      var edge = undefined,
          childNodeId = undefined,
          childNode = undefined,
          toId = undefined,
          fromId = undefined,
          otherNodeId = undefined;

      // loop over all child nodes and their edges to find edges going out of the cluster
      // these edges will be replaced by clusterEdges.
      var childKeys = Object.keys(childNodesObj);
      var createEdges = [];
      for (var i = 0; i < childKeys.length; i++) {
        childNodeId = childKeys[i];
        childNode = childNodesObj[childNodeId];

        // construct new edges from the cluster to others
        for (var j = 0; j < childNode.edges.length; j++) {
          edge = childNode.edges[j];
          // we only handle edges that are visible to the system, not the disabled ones from the clustering process.
          if (edge.hiddenByCluster !== true) {
            // self-referencing edges will be added to the "hidden" list
            if (edge.toId == edge.fromId) {
              childEdgesObj[edge.id] = edge;
            } else {
              // set up the from and to.
              if (edge.toId == childNodeId) {
                // this is a double equals because ints and strings can be interchanged here.
                toId = clusterNodeProperties.id;
                fromId = edge.fromId;
                otherNodeId = fromId;
              } else {
                toId = edge.toId;
                fromId = clusterNodeProperties.id;
                otherNodeId = toId;
              }
            }

            // Only edges from the cluster outwards are being replaced.
            if (childNodesObj[otherNodeId] === undefined) {
              createEdges.push({ edge: edge, fromId: fromId, toId: toId });
            }
          }
        }
      }

      // here we actually create the replacement edges. We could not do this in the loop above as the creation process
      // would add an edge to the edges array we are iterating over.
      for (var j = 0; j < createEdges.length; j++) {
        var _edge = createEdges[j].edge;
        // copy the options of the edge we will replace
        var clonedOptions = _NetworkUtil2['default']._cloneOptions(_edge, 'edge');
        // make sure the properties of clusterEdges are superimposed on it
        util.deepExtend(clonedOptions, clusterEdgeProperties);

        // set up the edge
        clonedOptions.from = createEdges[j].fromId;
        clonedOptions.to = createEdges[j].toId;
        clonedOptions.id = 'clusterEdge:' + util.randomUUID();
        //clonedOptions.id = '(cf: ' + createEdges[j].fromId + " to: " + createEdges[j].toId + ")" + Math.random();

        // create the edge and give a reference to the one it replaced.
        var newEdge = this.body.functions.createEdge(clonedOptions);
        newEdge.clusteringEdgeReplacingId = _edge.id;

        // connect the edge.
        this.body.edges[newEdge.id] = newEdge;
        newEdge.connect();

        // hide the replaced edge
        _edge.setOptions({ physics: false, hidden: true });
        _edge.hiddenByCluster = true;
      }
    }

    /**
    * This function checks the options that can be supplied to the different cluster functions
    * for certain fields and inserts defaults if needed
    * @param options
    * @returns {*}
    * @private
    */
  }, {
    key: '_checkOptions',
    value: function _checkOptions() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      if (options.clusterEdgeProperties === undefined) {
        options.clusterEdgeProperties = {};
      }
      if (options.clusterNodeProperties === undefined) {
        options.clusterNodeProperties = {};
      }

      return options;
    }

    /**
    *
    * @param {Object}    childNodesObj         | object with node objects, id as keys, same as childNodes except it also contains a source node
    * @param {Object}    childEdgesObj         | object with edge objects, id as keys
    * @param {Array}     options               | object with {clusterNodeProperties, clusterEdgeProperties, processProperties}
    * @param {Boolean}   refreshData | when true, do not wrap up
    * @private
    */
  }, {
    key: '_cluster',
    value: function _cluster(childNodesObj, childEdgesObj, options) {
      var refreshData = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];

      // kill condition: no children so can't cluster or only one node in the cluster, dont bother
      if (Object.keys(childNodesObj).length < 2) {
        return;
      }

      // check if this cluster call is not trying to cluster anything that is in another cluster.
      for (var nodeId in childNodesObj) {
        if (childNodesObj.hasOwnProperty(nodeId)) {
          if (this.clusteredNodes[nodeId] !== undefined) {
            return;
          }
        }
      }

      var clusterNodeProperties = util.deepExtend({}, options.clusterNodeProperties);

      // construct the clusterNodeProperties
      if (options.processProperties !== undefined) {
        // get the childNode options
        var childNodesOptions = [];
        for (var nodeId in childNodesObj) {
          if (childNodesObj.hasOwnProperty(nodeId)) {
            var clonedOptions = _NetworkUtil2['default']._cloneOptions(childNodesObj[nodeId]);
            childNodesOptions.push(clonedOptions);
          }
        }

        // get clusterproperties based on childNodes
        var childEdgesOptions = [];
        for (var edgeId in childEdgesObj) {
          if (childEdgesObj.hasOwnProperty(edgeId)) {
            // these cluster edges will be removed on creation of the cluster.
            if (edgeId.substr(0, 12) !== "clusterEdge:") {
              var clonedOptions = _NetworkUtil2['default']._cloneOptions(childEdgesObj[edgeId], 'edge');
              childEdgesOptions.push(clonedOptions);
            }
          }
        }

        clusterNodeProperties = options.processProperties(clusterNodeProperties, childNodesOptions, childEdgesOptions);
        if (!clusterNodeProperties) {
          throw new Error("The processProperties function does not return properties!");
        }
      }

      // check if we have an unique id;
      if (clusterNodeProperties.id === undefined) {
        clusterNodeProperties.id = 'cluster:' + util.randomUUID();
      }
      var clusterId = clusterNodeProperties.id;

      if (clusterNodeProperties.label === undefined) {
        clusterNodeProperties.label = 'cluster';
      }

      // give the clusterNode a postion if it does not have one.
      var pos = undefined;
      if (clusterNodeProperties.x === undefined) {
        pos = this._getClusterPosition(childNodesObj);
        clusterNodeProperties.x = pos.x;
      }
      if (clusterNodeProperties.y === undefined) {
        if (pos === undefined) {
          pos = this._getClusterPosition(childNodesObj);
        }
        clusterNodeProperties.y = pos.y;
      }

      // force the ID to remain the same
      clusterNodeProperties.id = clusterId;

      // create the clusterNode
      var clusterNode = this.body.functions.createNode(clusterNodeProperties, _componentsNodesCluster2['default']);
      clusterNode.isCluster = true;
      clusterNode.containedNodes = childNodesObj;
      clusterNode.containedEdges = childEdgesObj;
      // cache a copy from the cluster edge properties if we have to reconnect others later on
      clusterNode.clusterEdgeProperties = options.clusterEdgeProperties;

      // finally put the cluster node into global
      this.body.nodes[clusterNodeProperties.id] = clusterNode;

      // create the new edges that will connect to the cluster, all self-referencing edges will be added to childEdgesObject here.
      this._createClusterEdges(childNodesObj, childEdgesObj, clusterNodeProperties, options.clusterEdgeProperties);

      // disable the childEdges
      for (var edgeId in childEdgesObj) {
        if (childEdgesObj.hasOwnProperty(edgeId)) {
          if (this.body.edges[edgeId] !== undefined) {
            var edge = this.body.edges[edgeId];
            edge.setOptions({ physics: false, hidden: true });
            edge.hiddenByCluster = true;
          }
        }
      }

      // disable the childNodes
      for (var nodeId in childNodesObj) {
        if (childNodesObj.hasOwnProperty(nodeId)) {
          this.clusteredNodes[nodeId] = { clusterId: clusterNodeProperties.id, node: this.body.nodes[nodeId] };
          this.body.nodes[nodeId].setOptions({ hidden: true, physics: false });
        }
      }

      // set ID to undefined so no duplicates arise
      clusterNodeProperties.id = undefined;

      // wrap up
      if (refreshData === true) {
        this.body.emitter.emit('_dataChanged');
      }
    }

    /**
    * Check if a node is a cluster.
    * @param nodeId
    * @returns {*}
    */
  }, {
    key: 'isCluster',
    value: function isCluster(nodeId) {
      if (this.body.nodes[nodeId] !== undefined) {
        return this.body.nodes[nodeId].isCluster === true;
      } else {
        console.log("Node does not exist.");
        return false;
      }
    }

    /**
    * get the position of the cluster node based on what's inside
    * @param {object} childNodesObj    | object with node objects, id as keys
    * @returns {{x: number, y: number}}
    * @private
    */
  }, {
    key: '_getClusterPosition',
    value: function _getClusterPosition(childNodesObj) {
      var childKeys = Object.keys(childNodesObj);
      var minX = childNodesObj[childKeys[0]].x;
      var maxX = childNodesObj[childKeys[0]].x;
      var minY = childNodesObj[childKeys[0]].y;
      var maxY = childNodesObj[childKeys[0]].y;
      var node = undefined;
      for (var i = 1; i < childKeys.length; i++) {
        node = childNodesObj[childKeys[i]];
        minX = node.x < minX ? node.x : minX;
        maxX = node.x > maxX ? node.x : maxX;
        minY = node.y < minY ? node.y : minY;
        maxY = node.y > maxY ? node.y : maxY;
      }

      return { x: 0.5 * (minX + maxX), y: 0.5 * (minY + maxY) };
    }

    /**
    * Open a cluster by calling this function.
    * @param {String}  clusterNodeId | the ID of the cluster node
    * @param {Boolean} refreshData | wrap up afterwards if not true
    */
  }, {
    key: 'openCluster',
    value: function openCluster(clusterNodeId, options) {
      var refreshData = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];

      // kill conditions
      if (clusterNodeId === undefined) {
        throw new Error("No clusterNodeId supplied to openCluster.");
      }
      if (this.body.nodes[clusterNodeId] === undefined) {
        throw new Error("The clusterNodeId supplied to openCluster does not exist.");
      }
      if (this.body.nodes[clusterNodeId].containedNodes === undefined) {
        console.log("The node:" + clusterNodeId + " is not a cluster.");
        return;
      }
      var clusterNode = this.body.nodes[clusterNodeId];
      var containedNodes = clusterNode.containedNodes;
      var containedEdges = clusterNode.containedEdges;

      // allow the user to position the nodes after release.
      if (options !== undefined && options.releaseFunction !== undefined && typeof options.releaseFunction === 'function') {
        var positions = {};
        var clusterPosition = { x: clusterNode.x, y: clusterNode.y };
        for (var nodeId in containedNodes) {
          if (containedNodes.hasOwnProperty(nodeId)) {
            var containedNode = this.body.nodes[nodeId];
            positions[nodeId] = { x: containedNode.x, y: containedNode.y };
          }
        }
        var newPositions = options.releaseFunction(clusterPosition, positions);

        for (var nodeId in containedNodes) {
          if (containedNodes.hasOwnProperty(nodeId)) {
            var containedNode = this.body.nodes[nodeId];
            if (newPositions[nodeId] !== undefined) {
              containedNode.x = newPositions[nodeId].x === undefined ? clusterNode.x : newPositions[nodeId].x;
              containedNode.y = newPositions[nodeId].y === undefined ? clusterNode.y : newPositions[nodeId].y;
            }
          }
        }
      } else {
        // copy the position from the cluster
        for (var nodeId in containedNodes) {
          if (containedNodes.hasOwnProperty(nodeId)) {
            var containedNode = this.body.nodes[nodeId];
            containedNode = containedNodes[nodeId];
            // inherit position
            if (containedNode.options.fixed.x === false) {
              containedNode.x = clusterNode.x;
            }
            if (containedNode.options.fixed.y === false) {
              containedNode.y = clusterNode.y;
            }
          }
        }
      }

      // release nodes
      for (var nodeId in containedNodes) {
        if (containedNodes.hasOwnProperty(nodeId)) {
          var containedNode = this.body.nodes[nodeId];

          // inherit speed
          containedNode.vx = clusterNode.vx;
          containedNode.vy = clusterNode.vy;

          // we use these methods to avoid reinstantiating the shape, which happens with setOptions.
          containedNode.setOptions({ hidden: false, physics: true });

          delete this.clusteredNodes[nodeId];
        }
      }

      // copy the clusterNode edges because we cannot iterate over an object that we add or remove from.
      var edgesToBeDeleted = [];
      for (var i = 0; i < clusterNode.edges.length; i++) {
        edgesToBeDeleted.push(clusterNode.edges[i]);
      }

      // actually handling the deleting.
      for (var i = 0; i < edgesToBeDeleted.length; i++) {
        var edge = edgesToBeDeleted[i];

        var otherNodeId = this._getConnectedId(edge, clusterNodeId);
        // if the other node is in another cluster, we transfer ownership of this edge to the other cluster
        if (this.clusteredNodes[otherNodeId] !== undefined) {
          // transfer ownership:
          var otherCluster = this.body.nodes[this.clusteredNodes[otherNodeId].clusterId];
          var transferEdge = this.body.edges[edge.clusteringEdgeReplacingId];
          if (transferEdge !== undefined) {
            otherCluster.containedEdges[transferEdge.id] = transferEdge;

            // delete local reference
            delete containedEdges[transferEdge.id];

            // create new cluster edge from the otherCluster:
            // get to and from
            var fromId = transferEdge.fromId;
            var toId = transferEdge.toId;
            if (transferEdge.toId == otherNodeId) {
              toId = this.clusteredNodes[otherNodeId].clusterId;
            } else {
              fromId = this.clusteredNodes[otherNodeId].clusterId;
            }

            // clone the options and apply the cluster options to them
            var clonedOptions = _NetworkUtil2['default']._cloneOptions(transferEdge, 'edge');
            util.deepExtend(clonedOptions, otherCluster.clusterEdgeProperties);

            // apply the edge specific options to it.
            var id = 'clusterEdge:' + util.randomUUID();
            util.deepExtend(clonedOptions, { from: fromId, to: toId, hidden: false, physics: true, id: id });

            // create it
            var newEdge = this.body.functions.createEdge(clonedOptions);
            newEdge.clusteringEdgeReplacingId = transferEdge.id;
            this.body.edges[id] = newEdge;
            this.body.edges[id].connect();
          }
        } else {
          var replacedEdge = this.body.edges[edge.clusteringEdgeReplacingId];
          if (replacedEdge !== undefined) {
            replacedEdge.setOptions({ physics: true, hidden: false });
            replacedEdge.hiddenByCluster = false;
          }
        }
        edge.cleanup();
        // this removes the edge from node.edges, which is why edgeIds is formed
        edge.disconnect();
        delete this.body.edges[edge.id];
      }

      // handle the releasing of the edges
      for (var edgeId in containedEdges) {
        if (containedEdges.hasOwnProperty(edgeId)) {
          var edge = containedEdges[edgeId];
          edge.setOptions({ physics: true, hidden: false });
          edge.hiddenByCluster = undefined;
          delete edge.hiddenByCluster;
        }
      }

      // remove clusterNode
      delete this.body.nodes[clusterNodeId];

      if (refreshData === true) {
        this.body.emitter.emit('_dataChanged');
      }
    }
  }, {
    key: 'getNodesInCluster',
    value: function getNodesInCluster(clusterId) {
      var nodesArray = [];
      if (this.isCluster(clusterId) === true) {
        var containedNodes = this.body.nodes[clusterId].containedNodes;
        for (var nodeId in containedNodes) {
          if (containedNodes.hasOwnProperty(nodeId)) {
            nodesArray.push(nodeId);
          }
        }
      }

      return nodesArray;
    }

    /**
    * Get the stack clusterId's that a certain node resides in. cluster A -> cluster B -> cluster C -> node
    * @param nodeId
    * @returns {Array}
    */
  }, {
    key: 'findNode',
    value: function findNode(nodeId) {
      var stack = [];
      var max = 100;
      var counter = 0;

      while (this.clusteredNodes[nodeId] !== undefined && counter < max) {
        stack.push(this.clusteredNodes[nodeId].node);
        nodeId = this.clusteredNodes[nodeId].clusterId;
        counter++;
      }
      stack.push(this.body.nodes[nodeId]);
      return stack;
    }

    /**
    * Get the Id the node is connected to
    * @param edge
    * @param nodeId
    * @returns {*}
    * @private
    */
  }, {
    key: '_getConnectedId',
    value: function _getConnectedId(edge, nodeId) {
      if (edge.toId != nodeId) {
        return edge.toId;
      } else if (edge.fromId != nodeId) {
        return edge.fromId;
      } else {
        return edge.fromId;
      }
    }

    /**
    * We determine how many connections denote an important hub.
    * We take the mean + 2*std as the important hub size. (Assuming a normal distribution of data, ~2.2%)
    *
    * @private
    */
  }, {
    key: '_getHubSize',
    value: function _getHubSize() {
      var average = 0;
      var averageSquared = 0;
      var hubCounter = 0;
      var largestHub = 0;

      for (var i = 0; i < this.body.nodeIndices.length; i++) {
        var node = this.body.nodes[this.body.nodeIndices[i]];
        if (node.edges.length > largestHub) {
          largestHub = node.edges.length;
        }
        average += node.edges.length;
        averageSquared += Math.pow(node.edges.length, 2);
        hubCounter += 1;
      }
      average = average / hubCounter;
      averageSquared = averageSquared / hubCounter;

      var variance = averageSquared - Math.pow(average, 2);
      var standardDeviation = Math.sqrt(variance);

      var hubThreshold = Math.floor(average + 2 * standardDeviation);

      // always have at least one to cluster
      if (hubThreshold > largestHub) {
        hubThreshold = largestHub;
      }

      return hubThreshold;
    }
  }]);

  return ClusterEngine;
})();

exports['default'] = ClusterEngine;
module.exports = exports['default'];

},{"../../util":73,"../NetworkUtil":11,"./components/nodes/Cluster":40}],18:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _componentsEdge = require("./components/Edge");

var _componentsEdge2 = _interopRequireDefault(_componentsEdge);

var _componentsSharedLabel = require("./components/shared/Label");

var _componentsSharedLabel2 = _interopRequireDefault(_componentsSharedLabel);

var util = require("../../util");
var DataSet = require('../../DataSet');
var DataView = require('../../DataView');

var EdgesHandler = (function () {
  function EdgesHandler(body, images, groups) {
    var _this = this;

    _classCallCheck(this, EdgesHandler);

    this.body = body;
    this.images = images;
    this.groups = groups;

    // create the edge API in the body container
    this.body.functions.createEdge = this.create.bind(this);

    this.edgesListeners = {
      add: function add(event, params) {
        _this.add(params.items);
      },
      update: function update(event, params) {
        _this.update(params.items);
      },
      remove: function remove(event, params) {
        _this.remove(params.items);
      }
    };

    this.options = {};
    this.defaultOptions = {
      arrows: {
        to: { enabled: false, scaleFactor: 1 }, // boolean / {arrowScaleFactor:1} / {enabled: false, arrowScaleFactor:1}
        middle: { enabled: false, scaleFactor: 1 },
        from: { enabled: false, scaleFactor: 1 }
      },
      color: {
        color: '#848484',
        highlight: '#848484',
        hover: '#848484',
        inherit: 'from',
        opacity: 1.0
      },
      dashes: false,
      font: {
        color: '#343434',
        size: 14, // px
        face: 'arial',
        background: 'none',
        strokeWidth: 2, // px
        strokeColor: '#ffffff',
        align: 'horizontal'
      },
      hidden: false,
      hoverWidth: 1.5,
      label: undefined,
      labelHighlightBold: true,
      length: undefined,
      physics: true,
      scaling: {
        min: 1,
        max: 15,
        label: {
          enabled: true,
          min: 14,
          max: 30,
          maxVisible: 30,
          drawThreshold: 5
        },
        customScalingFunction: function customScalingFunction(min, max, total, value) {
          if (max === min) {
            return 0.5;
          } else {
            var scale = 1 / (max - min);
            return Math.max(0, (value - min) * scale);
          }
        }
      },
      selectionWidth: 1.5,
      selfReferenceSize: 20,
      shadow: {
        enabled: false,
        size: 10,
        x: 5,
        y: 5
      },
      smooth: {
        enabled: true,
        type: "dynamic",
        forceDirection: 'none',
        roundness: 0.5
      },
      title: undefined,
      width: 1,
      value: undefined
    };

    util.extend(this.options, this.defaultOptions);

    this.bindEventListeners();
  }

  _createClass(EdgesHandler, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this2 = this;

      // this allows external modules to force all dynamic curves to turn static.
      this.body.emitter.on("_forceDisableDynamicCurves", function (type) {
        if (type === 'dynamic') {
          type = 'continuous';
        }
        var emitChange = false;
        for (var edgeId in _this2.body.edges) {
          if (_this2.body.edges.hasOwnProperty(edgeId)) {
            var edge = _this2.body.edges[edgeId];
            var edgeData = _this2.body.data.edges._data[edgeId];

            // only forcilby remove the smooth curve if the data has been set of the edge has the smooth curves defined.
            // this is because a change in the global would not affect these curves.
            if (edgeData !== undefined) {
              var edgeOptions = edgeData.smooth;
              if (edgeOptions !== undefined) {
                if (edgeOptions.enabled === true && edgeOptions.type === 'dynamic') {
                  if (type === undefined) {
                    edge.setOptions({ smooth: false });
                  } else {
                    edge.setOptions({ smooth: { type: type } });
                  }
                  emitChange = true;
                }
              }
            }
          }
        }
        if (emitChange === true) {
          _this2.body.emitter.emit("_dataChanged");
        }
      });

      // this is called when options of EXISTING nodes or edges have changed.
      this.body.emitter.on("_dataUpdated", function () {
        _this2.reconnectEdges();
        _this2.markAllEdgesAsDirty();
      });

      // refresh the edges. Used when reverting from hierarchical layout
      this.body.emitter.on("refreshEdges", this.refresh.bind(this));
      this.body.emitter.on("refresh", this.refresh.bind(this));
      this.body.emitter.on("destroy", function () {
        delete _this2.body.functions.createEdge;
        delete _this2.edgesListeners.add;
        delete _this2.edgesListeners.update;
        delete _this2.edgesListeners.remove;
        delete _this2.edgesListeners;
      });
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        // use the parser from the Edge class to fill in all shorthand notations
        _componentsEdge2['default'].parseOptions(this.options, options);

        // hanlde multiple input cases for color
        if (options.color !== undefined) {
          this.markAllEdgesAsDirty();
        }

        // update smooth settings in all edges
        var dataChanged = false;
        if (options.smooth !== undefined) {
          for (var edgeId in this.body.edges) {
            if (this.body.edges.hasOwnProperty(edgeId)) {
              dataChanged = this.body.edges[edgeId].updateEdgeType() || dataChanged;
            }
          }
        }

        // update fonts in all edges
        if (options.font !== undefined) {
          // use the parser from the Label class to fill in all shorthand notations
          _componentsSharedLabel2['default'].parseOptions(this.options.font, options);
          for (var edgeId in this.body.edges) {
            if (this.body.edges.hasOwnProperty(edgeId)) {
              this.body.edges[edgeId].updateLabelModule();
            }
          }
        }

        // update the state of the variables if needed
        if (options.hidden !== undefined || options.physics !== undefined || dataChanged === true) {
          this.body.emitter.emit('_dataChanged');
        }
      }
    }

    /**
     * Load edges by reading the data table
     * @param {Array | DataSet | DataView} edges    The data containing the edges.
     * @private
     * @private
     */
  }, {
    key: 'setData',
    value: function setData(edges) {
      var _this3 = this;

      var doNotEmit = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var oldEdgesData = this.body.data.edges;

      if (edges instanceof DataSet || edges instanceof DataView) {
        this.body.data.edges = edges;
      } else if (Array.isArray(edges)) {
        this.body.data.edges = new DataSet();
        this.body.data.edges.add(edges);
      } else if (!edges) {
        this.body.data.edges = new DataSet();
      } else {
        throw new TypeError('Array or DataSet expected');
      }

      // TODO: is this null or undefined or false?
      if (oldEdgesData) {
        // unsubscribe from old dataset
        util.forEach(this.edgesListeners, function (callback, event) {
          oldEdgesData.off(event, callback);
        });
      }

      // remove drawn edges
      this.body.edges = {};

      // TODO: is this null or undefined or false?
      if (this.body.data.edges) {
        // subscribe to new dataset
        util.forEach(this.edgesListeners, function (callback, event) {
          _this3.body.data.edges.on(event, callback);
        });

        // draw all new nodes
        var ids = this.body.data.edges.getIds();
        this.add(ids, true);
      }

      if (doNotEmit === false) {
        this.body.emitter.emit("_dataChanged");
      }
    }

    /**
     * Add edges
     * @param {Number[] | String[]} ids
     * @private
     */
  }, {
    key: 'add',
    value: function add(ids) {
      var doNotEmit = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var edges = this.body.edges;
      var edgesData = this.body.data.edges;

      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];

        var oldEdge = edges[id];
        if (oldEdge) {
          oldEdge.disconnect();
        }

        var data = edgesData.get(id, { "showInternalIds": true });
        edges[id] = this.create(data);
      }

      if (doNotEmit === false) {
        this.body.emitter.emit("_dataChanged");
      }
    }

    /**
     * Update existing edges, or create them when not yet existing
     * @param {Number[] | String[]} ids
     * @private
     */
  }, {
    key: 'update',
    value: function update(ids) {
      var edges = this.body.edges;
      var edgesData = this.body.data.edges;
      var dataChanged = false;
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var data = edgesData.get(id);
        var edge = edges[id];
        if (edge !== undefined) {
          // update edge
          edge.disconnect();
          dataChanged = edge.setOptions(data) || dataChanged; // if a support node is added, data can be changed.
          edge.connect();
        } else {
          // create edge
          this.body.edges[id] = this.create(data);
          dataChanged = true;
        }
      }

      if (dataChanged === true) {
        this.body.emitter.emit("_dataChanged");
      } else {
        this.body.emitter.emit("_dataUpdated");
      }
    }

    /**
     * Remove existing edges. Non existing ids will be ignored
     * @param {Number[] | String[]} ids
     * @private
     */
  }, {
    key: 'remove',
    value: function remove(ids) {
      var edges = this.body.edges;
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var edge = edges[id];
        if (edge !== undefined) {
          edge.cleanup();
          edge.disconnect();
          delete edges[id];
        }
      }

      this.body.emitter.emit("_dataChanged");
    }
  }, {
    key: 'refresh',
    value: function refresh() {
      var edges = this.body.edges;
      for (var edgeId in edges) {
        var edge = undefined;
        if (edges.hasOwnProperty(edgeId)) {
          edge = edges[edgeId];
        }
        var data = this.body.data.edges._data[edgeId];
        if (edge !== undefined && data !== undefined) {
          edge.setOptions(data);
        }
      }
    }
  }, {
    key: 'create',
    value: function create(properties) {
      return new _componentsEdge2['default'](properties, this.body, this.options);
    }
  }, {
    key: 'markAllEdgesAsDirty',
    value: function markAllEdgesAsDirty() {
      for (var edgeId in this.body.edges) {
        this.body.edges[edgeId].edgeType.colorDirty = true;
      }
    }

    /**
     * Reconnect all edges
     * @private
     */
  }, {
    key: 'reconnectEdges',
    value: function reconnectEdges() {
      var id;
      var nodes = this.body.nodes;
      var edges = this.body.edges;

      for (id in nodes) {
        if (nodes.hasOwnProperty(id)) {
          nodes[id].edges = [];
        }
      }

      for (id in edges) {
        if (edges.hasOwnProperty(id)) {
          var edge = edges[id];
          edge.from = null;
          edge.to = null;
          edge.connect();
        }
      }
    }
  }, {
    key: 'getConnectedNodes',
    value: function getConnectedNodes(edgeId) {
      var nodeList = [];
      if (this.body.edges[edgeId] !== undefined) {
        var edge = this.body.edges[edgeId];
        if (edge.fromId) {
          nodeList.push(edge.fromId);
        }
        if (edge.toId) {
          nodeList.push(edge.toId);
        }
      }
      return nodeList;
    }
  }]);

  return EdgesHandler;
})();

exports['default'] = EdgesHandler;
module.exports = exports['default'];

},{"../../DataSet":2,"../../DataView":3,"../../util":73,"./components/Edge":28,"./components/shared/Label":66}],19:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var util = require('../../util');

/**
 * @class Groups
 * This class can store groups and options specific for groups.
 */

var Groups = (function () {
  function Groups() {
    _classCallCheck(this, Groups);

    this.clear();
    this.defaultIndex = 0;
    this.groupsArray = [];
    this.groupIndex = 0;

    this.defaultGroups = [{ border: "#2B7CE9", background: "#97C2FC", highlight: { border: "#2B7CE9", background: "#D2E5FF" }, hover: { border: "#2B7CE9", background: "#D2E5FF" } }, // 0: blue
    { border: "#FFA500", background: "#FFFF00", highlight: { border: "#FFA500", background: "#FFFFA3" }, hover: { border: "#FFA500", background: "#FFFFA3" } }, // 1: yellow
    { border: "#FA0A10", background: "#FB7E81", highlight: { border: "#FA0A10", background: "#FFAFB1" }, hover: { border: "#FA0A10", background: "#FFAFB1" } }, // 2: red
    { border: "#41A906", background: "#7BE141", highlight: { border: "#41A906", background: "#A1EC76" }, hover: { border: "#41A906", background: "#A1EC76" } }, // 3: green
    { border: "#E129F0", background: "#EB7DF4", highlight: { border: "#E129F0", background: "#F0B3F5" }, hover: { border: "#E129F0", background: "#F0B3F5" } }, // 4: magenta
    { border: "#7C29F0", background: "#AD85E4", highlight: { border: "#7C29F0", background: "#D3BDF0" }, hover: { border: "#7C29F0", background: "#D3BDF0" } }, // 5: purple
    { border: "#C37F00", background: "#FFA807", highlight: { border: "#C37F00", background: "#FFCA66" }, hover: { border: "#C37F00", background: "#FFCA66" } }, // 6: orange
    { border: "#4220FB", background: "#6E6EFD", highlight: { border: "#4220FB", background: "#9B9BFD" }, hover: { border: "#4220FB", background: "#9B9BFD" } }, // 7: darkblue
    { border: "#FD5A77", background: "#FFC0CB", highlight: { border: "#FD5A77", background: "#FFD1D9" }, hover: { border: "#FD5A77", background: "#FFD1D9" } }, // 8: pink
    { border: "#4AD63A", background: "#C2FABC", highlight: { border: "#4AD63A", background: "#E6FFE3" }, hover: { border: "#4AD63A", background: "#E6FFE3" } }, // 9: mint

    { border: "#990000", background: "#EE0000", highlight: { border: "#BB0000", background: "#FF3333" }, hover: { border: "#BB0000", background: "#FF3333" } }, // 10:bright red

    { border: "#FF6000", background: "#FF6000", highlight: { border: "#FF6000", background: "#FF6000" }, hover: { border: "#FF6000", background: "#FF6000" } }, // 12: real orange
    { border: "#97C2FC", background: "#2B7CE9", highlight: { border: "#D2E5FF", background: "#2B7CE9" }, hover: { border: "#D2E5FF", background: "#2B7CE9" } }, // 13: blue
    { border: "#399605", background: "#255C03", highlight: { border: "#399605", background: "#255C03" }, hover: { border: "#399605", background: "#255C03" } }, // 14: green
    { border: "#B70054", background: "#FF007E", highlight: { border: "#B70054", background: "#FF007E" }, hover: { border: "#B70054", background: "#FF007E" } }, // 15: magenta
    { border: "#AD85E4", background: "#7C29F0", highlight: { border: "#D3BDF0", background: "#7C29F0" }, hover: { border: "#D3BDF0", background: "#7C29F0" } }, // 16: purple
    { border: "#4557FA", background: "#000EA1", highlight: { border: "#6E6EFD", background: "#000EA1" }, hover: { border: "#6E6EFD", background: "#000EA1" } }, // 17: darkblue
    { border: "#FFC0CB", background: "#FD5A77", highlight: { border: "#FFD1D9", background: "#FD5A77" }, hover: { border: "#FFD1D9", background: "#FD5A77" } }, // 18: pink
    { border: "#C2FABC", background: "#74D66A", highlight: { border: "#E6FFE3", background: "#74D66A" }, hover: { border: "#E6FFE3", background: "#74D66A" } }, // 19: mint

    { border: "#EE0000", background: "#990000", highlight: { border: "#FF3333", background: "#BB0000" }, hover: { border: "#FF3333", background: "#BB0000" } } // 20:bright red
    ];

    this.options = {};
    this.defaultOptions = {
      useDefaultGroups: true
    };
    util.extend(this.options, this.defaultOptions);
  }

  _createClass(Groups, [{
    key: "setOptions",
    value: function setOptions(options) {
      var optionFields = ['useDefaultGroups'];

      if (options !== undefined) {
        for (var groupName in options) {
          if (options.hasOwnProperty(groupName)) {
            if (optionFields.indexOf(groupName) === -1) {
              var group = options[groupName];
              this.add(groupName, group);
            }
          }
        }
      }
    }

    /**
     * Clear all groups
     */
  }, {
    key: "clear",
    value: function clear() {
      this.groups = {};
      this.groupsArray = [];
    }

    /**
     * get group options of a groupname. If groupname is not found, a new group
     * is added.
     * @param {*} groupname        Can be a number, string, Date, etc.
     * @return {Object} group      The created group, containing all group options
     */
  }, {
    key: "get",
    value: function get(groupname) {
      var group = this.groups[groupname];
      if (group === undefined) {
        if (this.options.useDefaultGroups === false && this.groupsArray.length > 0) {
          // create new group
          var index = this.groupIndex % this.groupsArray.length;
          this.groupIndex++;
          group = {};
          group.color = this.groups[this.groupsArray[index]];
          this.groups[groupname] = group;
        } else {
          // create new group
          var index = this.defaultIndex % this.defaultGroups.length;
          this.defaultIndex++;
          group = {};
          group.color = this.defaultGroups[index];
          this.groups[groupname] = group;
        }
      }

      return group;
    }

    /**
     * Add a custom group style
     * @param {String} groupName
     * @param {Object} style       An object containing borderColor,
     *                             backgroundColor, etc.
     * @return {Object} group      The created group object
     */
  }, {
    key: "add",
    value: function add(groupName, style) {
      this.groups[groupName] = style;
      this.groupsArray.push(groupName);
      return style;
    }
  }]);

  return Groups;
})();

exports["default"] = Groups;
module.exports = exports["default"];

},{"../../util":73}],20:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _componentsNavigationHandler = require('./components/NavigationHandler');

var _componentsNavigationHandler2 = _interopRequireDefault(_componentsNavigationHandler);

var _componentsPopup = require('./components/Popup');

var _componentsPopup2 = _interopRequireDefault(_componentsPopup);

var util = require('../../util');

var InteractionHandler = (function () {
  function InteractionHandler(body, canvas, selectionHandler) {
    _classCallCheck(this, InteractionHandler);

    this.body = body;
    this.canvas = canvas;
    this.selectionHandler = selectionHandler;
    this.navigationHandler = new _componentsNavigationHandler2['default'](body, canvas);

    // bind the events from hammer to functions in this object
    this.body.eventListeners.onTap = this.onTap.bind(this);
    this.body.eventListeners.onTouch = this.onTouch.bind(this);
    this.body.eventListeners.onDoubleTap = this.onDoubleTap.bind(this);
    this.body.eventListeners.onHold = this.onHold.bind(this);
    this.body.eventListeners.onDragStart = this.onDragStart.bind(this);
    this.body.eventListeners.onDrag = this.onDrag.bind(this);
    this.body.eventListeners.onDragEnd = this.onDragEnd.bind(this);
    this.body.eventListeners.onMouseWheel = this.onMouseWheel.bind(this);
    this.body.eventListeners.onPinch = this.onPinch.bind(this);
    this.body.eventListeners.onMouseMove = this.onMouseMove.bind(this);
    this.body.eventListeners.onRelease = this.onRelease.bind(this);
    this.body.eventListeners.onContext = this.onContext.bind(this);

    this.touchTime = 0;
    this.drag = {};
    this.pinch = {};
    this.popup = undefined;
    this.popupObj = undefined;
    this.popupTimer = undefined;

    this.body.functions.getPointer = this.getPointer.bind(this);

    this.options = {};
    this.defaultOptions = {
      dragNodes: true,
      dragView: true,
      hover: false,
      keyboard: {
        enabled: false,
        speed: { x: 10, y: 10, zoom: 0.02 },
        bindToWindow: true
      },
      navigationButtons: false,
      tooltipDelay: 300,
      zoomView: true
    };
    util.extend(this.options, this.defaultOptions);

    this.bindEventListeners();
  }

  _createClass(InteractionHandler, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this = this;

      this.body.emitter.on('destroy', function () {
        clearTimeout(_this.popupTimer);
        delete _this.body.functions.getPointer;
      });
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        // extend all but the values in fields
        var fields = ['hideEdgesOnDrag', 'hideNodesOnDrag', 'keyboard', 'multiselect', 'selectable', 'selectConnectedEdges'];
        util.selectiveNotDeepExtend(fields, this.options, options);

        // merge the keyboard options in.
        util.mergeOptions(this.options, options, 'keyboard');

        if (options.tooltip) {
          util.extend(this.options.tooltip, options.tooltip);
          if (options.tooltip.color) {
            this.options.tooltip.color = util.parseColor(options.tooltip.color);
          }
        }
      }

      this.navigationHandler.setOptions(this.options);
    }

    /**
     * Get the pointer location from a touch location
     * @param {{x: Number, y: Number}} touch
     * @return {{x: Number, y: Number}} pointer
     * @private
     */
  }, {
    key: 'getPointer',
    value: function getPointer(touch) {
      return {
        x: touch.x - util.getAbsoluteLeft(this.canvas.frame.canvas),
        y: touch.y - util.getAbsoluteTop(this.canvas.frame.canvas)
      };
    }

    /**
     * On start of a touch gesture, store the pointer
     * @param event
     * @private
     */
  }, {
    key: 'onTouch',
    value: function onTouch(event) {
      if (new Date().valueOf() - this.touchTime > 50) {
        this.drag.pointer = this.getPointer(event.center);
        this.drag.pinched = false;
        this.pinch.scale = this.body.view.scale;
        // to avoid double fireing of this event because we have two hammer instances. (on canvas and on frame)
        this.touchTime = new Date().valueOf();
      }
    }

    /**
     * handle tap/click event: select/unselect a node
     * @private
     */
  }, {
    key: 'onTap',
    value: function onTap(event) {
      var pointer = this.getPointer(event.center);
      var multiselect = this.selectionHandler.options.multiselect && (event.changedPointers[0].ctrlKey || event.changedPointers[0].metaKey);

      this.checkSelectionChanges(pointer, event, multiselect);
      this.selectionHandler._generateClickEvent('click', event, pointer);
    }

    /**
     * handle doubletap event
     * @private
     */
  }, {
    key: 'onDoubleTap',
    value: function onDoubleTap(event) {
      var pointer = this.getPointer(event.center);
      this.selectionHandler._generateClickEvent('doubleClick', event, pointer);
    }

    /**
     * handle long tap event: multi select nodes
     * @private
     */
  }, {
    key: 'onHold',
    value: function onHold(event) {
      var pointer = this.getPointer(event.center);
      var multiselect = this.selectionHandler.options.multiselect;

      this.checkSelectionChanges(pointer, event, multiselect);

      this.selectionHandler._generateClickEvent('click', event, pointer);
      this.selectionHandler._generateClickEvent('hold', event, pointer);
    }

    /**
     * handle the release of the screen
     *
     * @private
     */
  }, {
    key: 'onRelease',
    value: function onRelease(event) {
      if (new Date().valueOf() - this.touchTime > 10) {
        var pointer = this.getPointer(event.center);
        this.selectionHandler._generateClickEvent('release', event, pointer);
        // to avoid double fireing of this event because we have two hammer instances. (on canvas and on frame)
        this.touchTime = new Date().valueOf();
      }
    }
  }, {
    key: 'onContext',
    value: function onContext(event) {
      var pointer = this.getPointer({ x: event.clientX, y: event.clientY });
      this.selectionHandler._generateClickEvent('oncontext', event, pointer);
    }

    /**
     *
     * @param pointer
     * @param add
     */
  }, {
    key: 'checkSelectionChanges',
    value: function checkSelectionChanges(pointer, event) {
      var add = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

      var previouslySelectedEdgeCount = this.selectionHandler._getSelectedEdgeCount();
      var previouslySelectedNodeCount = this.selectionHandler._getSelectedNodeCount();
      var previousSelection = this.selectionHandler.getSelection();
      var selected = undefined;
      if (add === true) {
        selected = this.selectionHandler.selectAdditionalOnPoint(pointer);
      } else {
        selected = this.selectionHandler.selectOnPoint(pointer);
      }
      var selectedEdgesCount = this.selectionHandler._getSelectedEdgeCount();
      var selectedNodesCount = this.selectionHandler._getSelectedNodeCount();
      var currentSelection = this.selectionHandler.getSelection();

      var _determineIfDifferent2 = this._determineIfDifferent(previousSelection, currentSelection);

      var nodesChanges = _determineIfDifferent2.nodesChanges;
      var edgesChanges = _determineIfDifferent2.edgesChanges;

      var nodeSelected = false;

      if (selectedNodesCount - previouslySelectedNodeCount > 0) {
        // node was selected
        this.selectionHandler._generateClickEvent('selectNode', event, pointer);
        selected = true;
        nodeSelected = true;
      } else if (selectedNodesCount - previouslySelectedNodeCount < 0) {
        // node was deselected
        this.selectionHandler._generateClickEvent('deselectNode', event, pointer, previousSelection);
        selected = true;
      } else if (selectedNodesCount === previouslySelectedNodeCount && nodesChanges === true) {
        this.selectionHandler._generateClickEvent('deselectNode', event, pointer, previousSelection);
        this.selectionHandler._generateClickEvent('selectNode', event, pointer);
        nodeSelected = true;
        selected = true;
      }

      // handle the selected edges
      if (selectedEdgesCount - previouslySelectedEdgeCount > 0 && nodeSelected === false) {
        // edge was selected
        this.selectionHandler._generateClickEvent('selectEdge', event, pointer);
        selected = true;
      } else if (selectedEdgesCount - previouslySelectedEdgeCount < 0) {
        // edge was deselected
        this.selectionHandler._generateClickEvent('deselectEdge', event, pointer, previousSelection);
        selected = true;
      } else if (selectedEdgesCount === previouslySelectedEdgeCount && edgesChanges === true) {
        this.selectionHandler._generateClickEvent('deselectEdge', event, pointer, previousSelection);
        this.selectionHandler._generateClickEvent('selectEdge', event, pointer);
        selected = true;
      }

      // fire the select event if anything has been selected or deselected
      if (selected === true) {
        // select or unselect
        this.selectionHandler._generateClickEvent('select', event, pointer);
      }
    }

    /**
     * This function checks if the nodes and edges previously selected have changed.
     * @param previousSelection
     * @param currentSelection
     * @returns {{nodesChanges: boolean, edgesChanges: boolean}}
     * @private
     */
  }, {
    key: '_determineIfDifferent',
    value: function _determineIfDifferent(previousSelection, currentSelection) {
      var nodesChanges = false;
      var edgesChanges = false;

      for (var i = 0; i < previousSelection.nodes.length; i++) {
        if (currentSelection.nodes.indexOf(previousSelection.nodes[i]) === -1) {
          nodesChanges = true;
        }
      }
      for (var i = 0; i < currentSelection.nodes.length; i++) {
        if (previousSelection.nodes.indexOf(previousSelection.nodes[i]) === -1) {
          nodesChanges = true;
        }
      }
      for (var i = 0; i < previousSelection.edges.length; i++) {
        if (currentSelection.edges.indexOf(previousSelection.edges[i]) === -1) {
          edgesChanges = true;
        }
      }
      for (var i = 0; i < currentSelection.edges.length; i++) {
        if (previousSelection.edges.indexOf(previousSelection.edges[i]) === -1) {
          edgesChanges = true;
        }
      }

      return { nodesChanges: nodesChanges, edgesChanges: edgesChanges };
    }

    /**
     * This function is called by onDragStart.
     * It is separated out because we can then overload it for the datamanipulation system.
     *
     * @private
     */
  }, {
    key: 'onDragStart',
    value: function onDragStart(event) {
      //in case the touch event was triggered on an external div, do the initial touch now.
      if (this.drag.pointer === undefined) {
        this.onTouch(event);
      }

      // note: drag.pointer is set in onTouch to get the initial touch location
      var node = this.selectionHandler.getNodeAt(this.drag.pointer);

      this.drag.dragging = true;
      this.drag.selection = [];
      this.drag.translation = util.extend({}, this.body.view.translation); // copy the object
      this.drag.nodeId = undefined;

      if (node !== undefined && this.options.dragNodes === true) {
        this.drag.nodeId = node.id;
        // select the clicked node if not yet selected
        if (node.isSelected() === false) {
          this.selectionHandler.unselectAll();
          this.selectionHandler.selectObject(node);
        }

        // after select to contain the node
        this.selectionHandler._generateClickEvent('dragStart', event, this.drag.pointer);

        var selection = this.selectionHandler.selectionObj.nodes;
        // create an array with the selected nodes and their original location and status
        for (var nodeId in selection) {
          if (selection.hasOwnProperty(nodeId)) {
            var object = selection[nodeId];
            var s = {
              id: object.id,
              node: object,

              // store original x, y, xFixed and yFixed, make the node temporarily Fixed
              x: object.x,
              y: object.y,
              xFixed: object.options.fixed.x,
              yFixed: object.options.fixed.y
            };

            object.options.fixed.x = true;
            object.options.fixed.y = true;

            this.drag.selection.push(s);
          }
        }
      } else {
        // fallback if no node is selected and thus the view is dragged.
        this.selectionHandler._generateClickEvent('dragStart', event, this.drag.pointer, undefined, true);
      }
    }

    /**
     * handle drag event
     * @private
     */
  }, {
    key: 'onDrag',
    value: function onDrag(event) {
      var _this2 = this;

      if (this.drag.pinched === true) {
        return;
      }

      // remove the focus on node if it is focussed on by the focusOnNode
      this.body.emitter.emit('unlockNode');

      var pointer = this.getPointer(event.center);

      var selection = this.drag.selection;
      if (selection && selection.length && this.options.dragNodes === true) {
        (function () {
          _this2.selectionHandler._generateClickEvent('dragging', event, pointer);

          // calculate delta's and new location
          var deltaX = pointer.x - _this2.drag.pointer.x;
          var deltaY = pointer.y - _this2.drag.pointer.y;

          // update position of all selected nodes
          selection.forEach(function (selection) {
            var node = selection.node;
            // only move the node if it was not fixed initially
            if (selection.xFixed === false) {
              node.x = _this2.canvas._XconvertDOMtoCanvas(_this2.canvas._XconvertCanvasToDOM(selection.x) + deltaX);
            }
            // only move the node if it was not fixed initially
            if (selection.yFixed === false) {
              node.y = _this2.canvas._YconvertDOMtoCanvas(_this2.canvas._YconvertCanvasToDOM(selection.y) + deltaY);
            }
          });

          // start the simulation of the physics
          _this2.body.emitter.emit('startSimulation');
        })();
      } else {
        // move the network
        if (this.options.dragView === true) {
          this.selectionHandler._generateClickEvent('dragging', event, pointer, undefined, true);

          // if the drag was not started properly because the click started outside the network div, start it now.
          if (this.drag.pointer === undefined) {
            this.onDragStart(event);
            return;
          }
          var diffX = pointer.x - this.drag.pointer.x;
          var diffY = pointer.y - this.drag.pointer.y;

          this.body.view.translation = { x: this.drag.translation.x + diffX, y: this.drag.translation.y + diffY };
          this.body.emitter.emit('_redraw');
        }
      }
    }

    /**
     * handle drag start event
     * @private
     */
  }, {
    key: 'onDragEnd',
    value: function onDragEnd(event) {
      this.drag.dragging = false;
      var selection = this.drag.selection;
      if (selection && selection.length) {
        selection.forEach(function (s) {
          // restore original xFixed and yFixed
          s.node.options.fixed.x = s.xFixed;
          s.node.options.fixed.y = s.yFixed;
        });
        this.selectionHandler._generateClickEvent('dragEnd', event, this.getPointer(event.center));
        this.body.emitter.emit('startSimulation');
      } else {
        this.selectionHandler._generateClickEvent('dragEnd', event, this.getPointer(event.center), undefined, true);
        this.body.emitter.emit('_requestRedraw');
      }
    }

    /**
     * Handle pinch event
     * @param event
     * @private
     */
  }, {
    key: 'onPinch',
    value: function onPinch(event) {
      var pointer = this.getPointer(event.center);

      this.drag.pinched = true;
      if (this.pinch['scale'] === undefined) {
        this.pinch.scale = 1;
      }

      // TODO: enabled moving while pinching?
      var scale = this.pinch.scale * event.scale;
      this.zoom(scale, pointer);
    }

    /**
     * Zoom the network in or out
     * @param {Number} scale a number around 1, and between 0.01 and 10
     * @param {{x: Number, y: Number}} pointer    Position on screen
     * @return {Number} appliedScale    scale is limited within the boundaries
     * @private
     */
  }, {
    key: 'zoom',
    value: function zoom(scale, pointer) {
      if (this.options.zoomView === true) {
        var scaleOld = this.body.view.scale;
        if (scale < 0.00001) {
          scale = 0.00001;
        }
        if (scale > 10) {
          scale = 10;
        }

        var preScaleDragPointer = undefined;
        if (this.drag !== undefined) {
          if (this.drag.dragging === true) {
            preScaleDragPointer = this.canvas.DOMtoCanvas(this.drag.pointer);
          }
        }
        // + this.canvas.frame.canvas.clientHeight / 2
        var translation = this.body.view.translation;

        var scaleFrac = scale / scaleOld;
        var tx = (1 - scaleFrac) * pointer.x + translation.x * scaleFrac;
        var ty = (1 - scaleFrac) * pointer.y + translation.y * scaleFrac;

        this.body.view.scale = scale;
        this.body.view.translation = { x: tx, y: ty };

        if (preScaleDragPointer != undefined) {
          var postScaleDragPointer = this.canvas.canvasToDOM(preScaleDragPointer);
          this.drag.pointer.x = postScaleDragPointer.x;
          this.drag.pointer.y = postScaleDragPointer.y;
        }

        this.body.emitter.emit('_requestRedraw');

        if (scaleOld < scale) {
          this.body.emitter.emit('zoom', { direction: '+', scale: this.body.view.scale });
        } else {
          this.body.emitter.emit('zoom', { direction: '-', scale: this.body.view.scale });
        }
      }
    }

    /**
     * Event handler for mouse wheel event, used to zoom the timeline
     * See http://adomas.org/javascript-mouse-wheel/
     *     https://github.com/EightMedia/hammer.js/issues/256
     * @param {MouseEvent}  event
     * @private
     */
  }, {
    key: 'onMouseWheel',
    value: function onMouseWheel(event) {
      // retrieve delta
      var delta = 0;
      if (event.wheelDelta) {
        /* IE/Opera. */
        delta = event.wheelDelta / 120;
      } else if (event.detail) {
        /* Mozilla case. */
        // In Mozilla, sign of delta is different than in IE.
        // Also, delta is multiple of 3.
        delta = -event.detail / 3;
      }

      // If delta is nonzero, handle it.
      // Basically, delta is now positive if wheel was scrolled up,
      // and negative, if wheel was scrolled down.
      if (delta !== 0) {

        // calculate the new scale
        var scale = this.body.view.scale;
        var zoom = delta / 10;
        if (delta < 0) {
          zoom = zoom / (1 - zoom);
        }
        scale *= 1 + zoom;

        // calculate the pointer location
        var pointer = this.getPointer({ x: event.clientX, y: event.clientY });

        // apply the new scale
        this.zoom(scale, pointer);
      }

      // Prevent default actions caused by mouse wheel.
      event.preventDefault();
    }

    /**
     * Mouse move handler for checking whether the title moves over a node with a title.
     * @param  {Event} event
     * @private
     */
  }, {
    key: 'onMouseMove',
    value: function onMouseMove(event) {
      var _this3 = this;

      var pointer = this.getPointer({ x: event.clientX, y: event.clientY });
      var popupVisible = false;

      // check if the previously selected node is still selected
      if (this.popup !== undefined) {
        if (this.popup.hidden === false) {
          this._checkHidePopup(pointer);
        }

        // if the popup was not hidden above
        if (this.popup.hidden === false) {
          popupVisible = true;
          this.popup.setPosition(pointer.x + 3, pointer.y - 5);
          this.popup.show();
        }
      }

      // if we bind the keyboard to the div, we have to highlight it to use it. This highlights it on mouse over.
      if (this.options.keyboard.bindToWindow === false && this.options.keyboard.enabled === true) {
        this.canvas.frame.focus();
      }

      // start a timeout that will check if the mouse is positioned above an element
      if (popupVisible === false) {
        if (this.popupTimer !== undefined) {
          clearInterval(this.popupTimer); // stop any running calculationTimer
          this.popupTimer = undefined;
        }
        if (!this.drag.dragging) {
          this.popupTimer = setTimeout(function () {
            return _this3._checkShowPopup(pointer);
          }, this.options.tooltipDelay);
        }
      }

      /**
      * Adding hover highlights
      */
      if (this.options.hover === true) {
        // adding hover highlights
        var obj = this.selectionHandler.getNodeAt(pointer);
        if (obj === undefined) {
          obj = this.selectionHandler.getEdgeAt(pointer);
        }
        this.selectionHandler.hoverObject(obj);
      }
    }

    /**
     * Check if there is an element on the given position in the network
     * (a node or edge). If so, and if this element has a title,
     * show a popup window with its title.
     *
     * @param {{x:Number, y:Number}} pointer
     * @private
     */
  }, {
    key: '_checkShowPopup',
    value: function _checkShowPopup(pointer) {
      var x = this.canvas._XconvertDOMtoCanvas(pointer.x);
      var y = this.canvas._YconvertDOMtoCanvas(pointer.y);
      var pointerObj = {
        left: x,
        top: y,
        right: x,
        bottom: y
      };

      var previousPopupObjId = this.popupObj === undefined ? undefined : this.popupObj.id;
      var nodeUnderCursor = false;
      var popupType = 'node';

      // check if a node is under the cursor.
      if (this.popupObj === undefined) {
        // search the nodes for overlap, select the top one in case of multiple nodes
        var nodeIndices = this.body.nodeIndices;
        var nodes = this.body.nodes;
        var node = undefined;
        var overlappingNodes = [];
        for (var i = 0; i < nodeIndices.length; i++) {
          node = nodes[nodeIndices[i]];
          if (node.isOverlappingWith(pointerObj) === true) {
            if (node.getTitle() !== undefined) {
              overlappingNodes.push(nodeIndices[i]);
            }
          }
        }

        if (overlappingNodes.length > 0) {
          // if there are overlapping nodes, select the last one, this is the one which is drawn on top of the others
          this.popupObj = nodes[overlappingNodes[overlappingNodes.length - 1]];
          // if you hover over a node, the title of the edge is not supposed to be shown.
          nodeUnderCursor = true;
        }
      }

      if (this.popupObj === undefined && nodeUnderCursor === false) {
        // search the edges for overlap
        var edgeIndices = this.body.edgeIndices;
        var edges = this.body.edges;
        var edge = undefined;
        var overlappingEdges = [];
        for (var i = 0; i < edgeIndices.length; i++) {
          edge = edges[edgeIndices[i]];
          if (edge.isOverlappingWith(pointerObj) === true) {
            if (edge.connected === true && edge.getTitle() !== undefined) {
              overlappingEdges.push(edgeIndices[i]);
            }
          }
        }

        if (overlappingEdges.length > 0) {
          this.popupObj = edges[overlappingEdges[overlappingEdges.length - 1]];
          popupType = 'edge';
        }
      }

      if (this.popupObj !== undefined) {
        // show popup message window
        if (this.popupObj.id !== previousPopupObjId) {
          if (this.popup === undefined) {
            this.popup = new _componentsPopup2['default'](this.canvas.frame);
          }

          this.popup.popupTargetType = popupType;
          this.popup.popupTargetId = this.popupObj.id;

          // adjust a small offset such that the mouse cursor is located in the
          // bottom left location of the popup, and you can easily move over the
          // popup area
          this.popup.setPosition(pointer.x + 3, pointer.y - 5);
          this.popup.setText(this.popupObj.getTitle());
          this.popup.show();
          this.body.emitter.emit('showPopup', this.popupObj.id);
        }
      } else {
        if (this.popup !== undefined) {
          this.popup.hide();
          this.body.emitter.emit('hidePopup');
        }
      }
    }

    /**
     * Check if the popup must be hidden, which is the case when the mouse is no
     * longer hovering on the object
     * @param {{x:Number, y:Number}} pointer
     * @private
     */
  }, {
    key: '_checkHidePopup',
    value: function _checkHidePopup(pointer) {
      var pointerObj = this.selectionHandler._pointerToPositionObject(pointer);

      var stillOnObj = false;
      if (this.popup.popupTargetType === 'node') {
        if (this.body.nodes[this.popup.popupTargetId] !== undefined) {
          stillOnObj = this.body.nodes[this.popup.popupTargetId].isOverlappingWith(pointerObj);

          // if the mouse is still one the node, we have to check if it is not also on one that is drawn on top of it.
          // we initially only check stillOnObj because this is much faster.
          if (stillOnObj === true) {
            var overNode = this.selectionHandler.getNodeAt(pointer);
            stillOnObj = overNode.id === this.popup.popupTargetId;
          }
        }
      } else {
        if (this.selectionHandler.getNodeAt(pointer) === undefined) {
          if (this.body.edges[this.popup.popupTargetId] !== undefined) {
            stillOnObj = this.body.edges[this.popup.popupTargetId].isOverlappingWith(pointerObj);
          }
        }
      }

      if (stillOnObj === false) {
        this.popupObj = undefined;
        this.popup.hide();
        this.body.emitter.emit('hidePopup');
      }
    }
  }]);

  return InteractionHandler;
})();

exports['default'] = InteractionHandler;
module.exports = exports['default'];

},{"../../util":73,"./components/NavigationHandler":29,"./components/Popup":31}],21:[function(require,module,exports){
/**
 * Created by Alex on 8/7/2015.
 */

// distance finding algorithm
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _componentsAlgorithmsFloydWarshallJs = require("./components/algorithms/FloydWarshall.js");

var _componentsAlgorithmsFloydWarshallJs2 = _interopRequireDefault(_componentsAlgorithmsFloydWarshallJs);

/**
 * KamadaKawai positions the nodes initially based on
 *
 * "AN ALGORITHM FOR DRAWING GENERAL UNDIRECTED GRAPHS"
 * -- Tomihisa KAMADA and Satoru KAWAI in 1989
 *
 * Possible optimizations in the distance calculation can be implemented.
 */

var KamadaKawai = (function () {
  function KamadaKawai(body, edgeLength, edgeStrength) {
    _classCallCheck(this, KamadaKawai);

    this.body = body;
    this.springLength = edgeLength;
    this.springConstant = edgeStrength;
    this.distanceSolver = new _componentsAlgorithmsFloydWarshallJs2["default"]();
  }

  /**
   * Not sure if needed but can be used to update the spring length and spring constant
   * @param options
   */

  _createClass(KamadaKawai, [{
    key: "setOptions",
    value: function setOptions(options) {
      if (options) {
        if (options.springLength) {
          this.springLength = options.springLength;
        }
        if (options.springConstant) {
          this.springConstant = options.springConstant;
        }
      }
    }

    /**
     * Position the system
     * @param nodesArray
     * @param edgesArray
     */
  }, {
    key: "solve",
    value: function solve(nodesArray, edgesArray) {
      var ignoreClusters = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

      // get distance matrix
      var D_matrix = this.distanceSolver.getDistances(this.body, nodesArray, edgesArray); // distance matrix

      // get the L Matrix
      this._createL_matrix(D_matrix);

      // get the K Matrix
      this._createK_matrix(D_matrix);

      // calculate positions
      var threshold = 0.01;
      var innerThreshold = 1;
      var iterations = 0;
      var maxIterations = Math.max(1000, Math.min(10 * this.body.nodeIndices.length, 6000));
      var maxInnerIterations = 5;

      var maxEnergy = 1e9;
      var highE_nodeId = 0,
          dE_dx = 0,
          dE_dy = 0,
          delta_m = 0,
          subIterations = 0;

      while (maxEnergy > threshold && iterations < maxIterations) {
        iterations += 1;

        var _getHighestEnergyNode2 = this._getHighestEnergyNode(ignoreClusters);

        var _getHighestEnergyNode22 = _slicedToArray(_getHighestEnergyNode2, 4);

        highE_nodeId = _getHighestEnergyNode22[0];
        maxEnergy = _getHighestEnergyNode22[1];
        dE_dx = _getHighestEnergyNode22[2];
        dE_dy = _getHighestEnergyNode22[3];

        delta_m = maxEnergy;
        subIterations = 0;
        while (delta_m > innerThreshold && subIterations < maxInnerIterations) {
          subIterations += 1;
          this._moveNode(highE_nodeId, dE_dx, dE_dy);

          var _getEnergy2 = this._getEnergy(highE_nodeId);

          var _getEnergy22 = _slicedToArray(_getEnergy2, 3);

          delta_m = _getEnergy22[0];
          dE_dx = _getEnergy22[1];
          dE_dy = _getEnergy22[2];
        }
      }
    }

    /**
     * get the node with the highest energy
     * @returns {*[]}
     * @private
     */
  }, {
    key: "_getHighestEnergyNode",
    value: function _getHighestEnergyNode(ignoreClusters) {
      var nodesArray = this.body.nodeIndices;
      var nodes = this.body.nodes;
      var maxEnergy = 0;
      var maxEnergyNodeId = nodesArray[0];
      var dE_dx_max = 0,
          dE_dy_max = 0;

      for (var nodeIdx = 0; nodeIdx < nodesArray.length; nodeIdx++) {
        var m = nodesArray[nodeIdx];
        // by not evaluating nodes with predefined positions we should only move nodes that have no positions.
        if (nodes[m].predefinedPosition === false || nodes[m].isCluster === true && ignoreClusters === true || nodes[m].options.fixed.x === true || nodes[m].options.fixed.y === true) {
          var _getEnergy3 = this._getEnergy(m);

          var _getEnergy32 = _slicedToArray(_getEnergy3, 3);

          var delta_m = _getEnergy32[0];
          var dE_dx = _getEnergy32[1];
          var dE_dy = _getEnergy32[2];

          if (maxEnergy < delta_m) {
            maxEnergy = delta_m;
            maxEnergyNodeId = m;
            dE_dx_max = dE_dx;
            dE_dy_max = dE_dy;
          }
        }
      }

      return [maxEnergyNodeId, maxEnergy, dE_dx_max, dE_dy_max];
    }

    /**
     * calculate the energy of a single node
     * @param m
     * @returns {*[]}
     * @private
     */
  }, {
    key: "_getEnergy",
    value: function _getEnergy(m) {
      var nodesArray = this.body.nodeIndices;
      var nodes = this.body.nodes;

      var x_m = nodes[m].x;
      var y_m = nodes[m].y;
      var dE_dx = 0;
      var dE_dy = 0;
      for (var iIdx = 0; iIdx < nodesArray.length; iIdx++) {
        var i = nodesArray[iIdx];
        if (i !== m) {
          var x_i = nodes[i].x;
          var y_i = nodes[i].y;
          var denominator = 1.0 / Math.sqrt(Math.pow(x_m - x_i, 2) + Math.pow(y_m - y_i, 2));
          dE_dx += this.K_matrix[m][i] * (x_m - x_i - this.L_matrix[m][i] * (x_m - x_i) * denominator);
          dE_dy += this.K_matrix[m][i] * (y_m - y_i - this.L_matrix[m][i] * (y_m - y_i) * denominator);
        }
      }

      var delta_m = Math.sqrt(Math.pow(dE_dx, 2) + Math.pow(dE_dy, 2));
      return [delta_m, dE_dx, dE_dy];
    }

    /**
     * move the node based on it's energy
     * the dx and dy are calculated from the linear system proposed by Kamada and Kawai
     * @param m
     * @param dE_dx
     * @param dE_dy
     * @private
     */
  }, {
    key: "_moveNode",
    value: function _moveNode(m, dE_dx, dE_dy) {
      var nodesArray = this.body.nodeIndices;
      var nodes = this.body.nodes;
      var d2E_dx2 = 0;
      var d2E_dxdy = 0;
      var d2E_dy2 = 0;

      var x_m = nodes[m].x;
      var y_m = nodes[m].y;
      for (var iIdx = 0; iIdx < nodesArray.length; iIdx++) {
        var i = nodesArray[iIdx];
        if (i !== m) {
          var x_i = nodes[i].x;
          var y_i = nodes[i].y;
          var denominator = 1.0 / Math.pow(Math.pow(x_m - x_i, 2) + Math.pow(y_m - y_i, 2), 1.5);
          d2E_dx2 += this.K_matrix[m][i] * (1 - this.L_matrix[m][i] * Math.pow(y_m - y_i, 2) * denominator);
          d2E_dxdy += this.K_matrix[m][i] * (this.L_matrix[m][i] * (x_m - x_i) * (y_m - y_i) * denominator);
          d2E_dy2 += this.K_matrix[m][i] * (1 - this.L_matrix[m][i] * Math.pow(x_m - x_i, 2) * denominator);
        }
      }
      // make the variable names easier to make the solving of the linear system easier to read
      var A = d2E_dx2,
          B = d2E_dxdy,
          C = dE_dx,
          D = d2E_dy2,
          E = dE_dy;

      // solve the linear system for dx and dy
      var dy = (C / A + E / B) / (B / A - D / B);
      var dx = -(B * dy + C) / A;

      // move the node
      nodes[m].x += dx;
      nodes[m].y += dy;
    }

    /**
     * Create the L matrix: edge length times shortest path
     * @param D_matrix
     * @private
     */
  }, {
    key: "_createL_matrix",
    value: function _createL_matrix(D_matrix) {
      var nodesArray = this.body.nodeIndices;
      var edgeLength = this.springLength;

      this.L_matrix = [];
      for (var i = 0; i < nodesArray.length; i++) {
        this.L_matrix[nodesArray[i]] = {};
        for (var j = 0; j < nodesArray.length; j++) {
          this.L_matrix[nodesArray[i]][nodesArray[j]] = edgeLength * D_matrix[nodesArray[i]][nodesArray[j]];
        }
      }
    }

    /**
     * Create the K matrix: spring constants times shortest path
     * @param D_matrix
     * @private
     */
  }, {
    key: "_createK_matrix",
    value: function _createK_matrix(D_matrix) {
      var nodesArray = this.body.nodeIndices;
      var edgeStrength = this.springConstant;

      this.K_matrix = [];
      for (var i = 0; i < nodesArray.length; i++) {
        this.K_matrix[nodesArray[i]] = {};
        for (var j = 0; j < nodesArray.length; j++) {
          this.K_matrix[nodesArray[i]][nodesArray[j]] = edgeStrength * Math.pow(D_matrix[nodesArray[i]][nodesArray[j]], -2);
        }
      }
    }
  }]);

  return KamadaKawai;
})();

exports["default"] = KamadaKawai;
module.exports = exports["default"];

},{"./components/algorithms/FloydWarshall.js":32}],22:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _NetworkUtil = require('../NetworkUtil');

var _NetworkUtil2 = _interopRequireDefault(_NetworkUtil);

var util = require('../../util');

var LayoutEngine = (function () {
  function LayoutEngine(body) {
    _classCallCheck(this, LayoutEngine);

    this.body = body;

    this.initialRandomSeed = Math.round(Math.random() * 1000000);
    this.randomSeed = this.initialRandomSeed;
    this.options = {};
    this.optionsBackup = {};

    this.defaultOptions = {
      randomSeed: undefined,
      improvedLayout: true,
      hierarchical: {
        enabled: false,
        levelSeparation: 150,
        direction: 'UD', // UD, DU, LR, RL
        sortMethod: 'hubsize' // hubsize, directed
      }
    };
    util.extend(this.options, this.defaultOptions);

    this.lastNodeOnLevel = {};
    this.hierarchicalParents = {};
    this.hierarchicalChildren = {};

    this.bindEventListeners();
  }

  _createClass(LayoutEngine, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this = this;

      this.body.emitter.on('_dataChanged', function () {
        _this.setupHierarchicalLayout();
      });
      this.body.emitter.on('_dataLoaded', function () {
        _this.layoutNetwork();
      });
      this.body.emitter.on('_resetHierarchicalLayout', function () {
        _this.setupHierarchicalLayout();
      });
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options, allOptions) {
      if (options !== undefined) {
        var prevHierarchicalState = this.options.hierarchical.enabled;
        util.selectiveDeepExtend(["randomSeed", "improvedLayout"], this.options, options);
        util.mergeOptions(this.options, options, 'hierarchical');
        if (options.randomSeed !== undefined) {
          this.initialRandomSeed = options.randomSeed;
        }

        if (this.options.hierarchical.enabled === true) {
          if (prevHierarchicalState === true) {
            // refresh the overridden options for nodes and edges.
            this.body.emitter.emit('refresh', true);
          }

          // make sure the level seperation is the right way up
          if (this.options.hierarchical.direction === 'RL' || this.options.hierarchical.direction === 'DU') {
            if (this.options.hierarchical.levelSeparation > 0) {
              this.options.hierarchical.levelSeparation *= -1;
            }
          } else {
            if (this.options.hierarchical.levelSeparation < 0) {
              this.options.hierarchical.levelSeparation *= -1;
            }
          }

          this.body.emitter.emit('_resetHierarchicalLayout');
          // because the hierarchical system needs it's own physics and smooth curve settings, we adapt the other options if needed.
          return this.adaptAllOptionsForHierarchicalLayout(allOptions);
        } else {
          if (prevHierarchicalState === true) {
            // refresh the overridden options for nodes and edges.
            this.body.emitter.emit('refresh');
            return util.deepExtend(allOptions, this.optionsBackup);
          }
        }
      }
      return allOptions;
    }
  }, {
    key: 'adaptAllOptionsForHierarchicalLayout',
    value: function adaptAllOptionsForHierarchicalLayout(allOptions) {
      if (this.options.hierarchical.enabled === true) {
        // set the physics
        if (allOptions.physics === undefined || allOptions.physics === true) {
          allOptions.physics = { solver: 'hierarchicalRepulsion' };
          this.optionsBackup.physics = { solver: 'barnesHut' };
        } else if (typeof allOptions.physics === 'object') {
          this.optionsBackup.physics = { solver: 'barnesHut' };
          if (allOptions.physics.solver !== undefined) {
            this.optionsBackup.physics = { solver: allOptions.physics.solver };
          }
          allOptions.physics['solver'] = 'hierarchicalRepulsion';
        } else if (allOptions.physics !== false) {
          this.optionsBackup.physics = { solver: 'barnesHut' };
          allOptions.physics['solver'] = 'hierarchicalRepulsion';
        }

        // get the type of static smooth curve in case it is required
        var type = 'horizontal';
        if (this.options.hierarchical.direction === 'RL' || this.options.hierarchical.direction === 'LR') {
          type = 'vertical';
        }

        // disable smooth curves if nothing is defined. If smooth curves have been turned on, turn them into static smooth curves.
        if (allOptions.edges === undefined) {
          this.optionsBackup.edges = { smooth: { enabled: true, type: 'dynamic' } };
          allOptions.edges = { smooth: false };
        } else if (allOptions.edges.smooth === undefined) {
          this.optionsBackup.edges = { smooth: { enabled: true, type: 'dynamic' } };
          allOptions.edges.smooth = false;
        } else {
          if (typeof allOptions.edges.smooth === 'boolean') {
            this.optionsBackup.edges = { smooth: allOptions.edges.smooth };
            allOptions.edges.smooth = { enabled: allOptions.edges.smooth, type: type };
          } else {
            // allow custom types except for dynamic
            if (allOptions.edges.smooth.type !== undefined && allOptions.edges.smooth.type !== 'dynamic') {
              type = allOptions.edges.smooth.type;
            }

            this.optionsBackup.edges = {
              smooth: allOptions.edges.smooth.enabled === undefined ? true : allOptions.edges.smooth.enabled,
              type: allOptions.edges.smooth.type === undefined ? 'dynamic' : allOptions.edges.smooth.type,
              roundness: allOptions.edges.smooth.roundness === undefined ? 0.5 : allOptions.edges.smooth.roundness,
              forceDirection: allOptions.edges.smooth.forceDirection === undefined ? false : allOptions.edges.smooth.forceDirection
            };
            allOptions.edges.smooth = {
              enabled: allOptions.edges.smooth.enabled === undefined ? true : allOptions.edges.smooth.enabled,
              type: type,
              roundness: allOptions.edges.smooth.roundness === undefined ? 0.5 : allOptions.edges.smooth.roundness,
              forceDirection: allOptions.edges.smooth.forceDirection === undefined ? false : allOptions.edges.smooth.forceDirection
            };
          }
        }

        // force all edges into static smooth curves. Only applies to edges that do not use the global options for smooth.
        this.body.emitter.emit('_forceDisableDynamicCurves', type);
      }
      return allOptions;
    }
  }, {
    key: 'seededRandom',
    value: function seededRandom() {
      var x = Math.sin(this.randomSeed++) * 10000;
      return x - Math.floor(x);
    }
  }, {
    key: 'positionInitially',
    value: function positionInitially(nodesArray) {
      if (this.options.hierarchical.enabled !== true) {
        this.randomSeed = this.initialRandomSeed;
        for (var i = 0; i < nodesArray.length; i++) {
          var node = nodesArray[i];
          var radius = 10 * 0.1 * nodesArray.length + 10;
          var angle = 2 * Math.PI * this.seededRandom();
          if (node.x === undefined) {
            node.x = radius * Math.cos(angle);
          }
          if (node.y === undefined) {
            node.y = radius * Math.sin(angle);
          }
        }
      }
    }

    /**
     * Use KamadaKawai to position nodes. This is quite a heavy algorithm so if there are a lot of nodes we
     * cluster them first to reduce the amount.
     */
  }, {
    key: 'layoutNetwork',
    value: function layoutNetwork() {
      if (this.options.hierarchical.enabled !== true && this.options.improvedLayout === true) {
        // first check if we should KamadaKawai to layout. The threshold is if less than half of the visible
        // nodes have predefined positions we use this.
        var positionDefined = 0;
        for (var i = 0; i < this.body.nodeIndices.length; i++) {
          var node = this.body.nodes[this.body.nodeIndices[i]];
          if (node.predefinedPosition === true) {
            positionDefined += 1;
          }
        }

        // if less than half of the nodes have a predefined position we continue
        if (positionDefined < 0.5 * this.body.nodeIndices.length) {
          var MAX_LEVELS = 10;
          var level = 0;
          var clusterThreshold = 100;
          // if there are a lot of nodes, we cluster before we run the algorithm.
          if (this.body.nodeIndices.length > clusterThreshold) {
            var startLength = this.body.nodeIndices.length;
            while (this.body.nodeIndices.length > clusterThreshold) {
              //console.time("clustering")
              level += 1;
              var before = this.body.nodeIndices.length;
              // if there are many nodes we do a hubsize cluster
              if (level % 3 === 0) {
                this.body.modules.clustering.clusterBridges();
              } else {
                this.body.modules.clustering.clusterOutliers();
              }
              var after = this.body.nodeIndices.length;
              if (before == after && level % 3 !== 0 || level > MAX_LEVELS) {
                this._declusterAll();
                this.body.emitter.emit("_layoutFailed");
                console.info("This network could not be positioned by this version of the improved layout algorithm. Please disable improvedLayout for better performance.");
                return;
              }
              //console.timeEnd("clustering")
              //console.log(level,after)
            }
            // increase the size of the edges
            this.body.modules.kamadaKawai.setOptions({ springLength: Math.max(150, 2 * startLength) });
          }

          // position the system for these nodes and edges
          this.body.modules.kamadaKawai.solve(this.body.nodeIndices, this.body.edgeIndices, true);

          // shift to center point
          this._shiftToCenter();

          // perturb the nodes a little bit to force the physics to kick in
          var offset = 70;
          for (var i = 0; i < this.body.nodeIndices.length; i++) {
            this.body.nodes[this.body.nodeIndices[i]].x += (0.5 - this.seededRandom()) * offset;
            this.body.nodes[this.body.nodeIndices[i]].y += (0.5 - this.seededRandom()) * offset;
          }

          // uncluster all clusters
          this._declusterAll();

          // reposition all bezier nodes.
          this.body.emitter.emit("_repositionBezierNodes");
        }
      }
    }

    /**
     * Move all the nodes towards to the center so gravitational pull wil not move the nodes away from view
     * @private
     */
  }, {
    key: '_shiftToCenter',
    value: function _shiftToCenter() {
      var range = _NetworkUtil2['default']._getRangeCore(this.body.nodes, this.body.nodeIndices);
      var center = _NetworkUtil2['default']._findCenter(range);
      for (var i = 0; i < this.body.nodeIndices.length; i++) {
        this.body.nodes[this.body.nodeIndices[i]].x -= center.x;
        this.body.nodes[this.body.nodeIndices[i]].y -= center.y;
      }
    }
  }, {
    key: '_declusterAll',
    value: function _declusterAll() {
      var clustersPresent = true;
      while (clustersPresent === true) {
        clustersPresent = false;
        for (var i = 0; i < this.body.nodeIndices.length; i++) {
          if (this.body.nodes[this.body.nodeIndices[i]].isCluster === true) {
            clustersPresent = true;
            this.body.modules.clustering.openCluster(this.body.nodeIndices[i], {}, false);
          }
        }
        if (clustersPresent === true) {
          this.body.emitter.emit('_dataChanged');
        }
      }
    }
  }, {
    key: 'getSeed',
    value: function getSeed() {
      return this.initialRandomSeed;
    }

    /**
     * This is the main function to layout the nodes in a hierarchical way.
     * It checks if the node details are supplied correctly
     *
     * @private
     */
  }, {
    key: 'setupHierarchicalLayout',
    value: function setupHierarchicalLayout() {
      if (this.options.hierarchical.enabled === true && this.body.nodeIndices.length > 0) {
        // get the size of the largest hubs and check if the user has defined a level for a node.
        var node = undefined,
            nodeId = undefined;
        var definedLevel = false;
        var undefinedLevel = false;
        this.hierarchicalLevels = {};
        this.nodeSpacing = 100;

        for (nodeId in this.body.nodes) {
          if (this.body.nodes.hasOwnProperty(nodeId)) {
            node = this.body.nodes[nodeId];
            if (node.options.level !== undefined) {
              definedLevel = true;
              this.hierarchicalLevels[nodeId] = node.options.level;
            } else {
              undefinedLevel = true;
            }
          }
        }

        // if the user defined some levels but not all, alert and run without hierarchical layout
        if (undefinedLevel === true && definedLevel === true) {
          throw new Error('To use the hierarchical layout, nodes require either no predefined levels or levels have to be defined for all nodes.');
          return;
        } else {
          // define levels if undefined by the users. Based on hubsize
          if (undefinedLevel === true) {
            if (this.options.hierarchical.sortMethod === 'hubsize') {
              this._determineLevelsByHubsize();
            } else if (this.options.hierarchical.sortMethod === 'directed') {
              this._determineLevelsDirected();
            } else if (this.options.hierarchical.sortMethod === 'custom') {
              this._determineLevelsCustomCallback();
            }
          }

          // check the distribution of the nodes per level.
          var distribution = this._getDistribution();

          // get the parent children relations.
          this._generateMap();

          // place the nodes on the canvas.
          this._placeNodesByHierarchy(distribution);

          // Todo: condense the whitespace.
          this._condenseHierarchy(distribution);

          // shift to center so gravity does not have to do much
          this._shiftToCenter();
        }
      }
    }

    /**
     * TODO: implement. Clear whitespace after positioning.
     * @private
     */
  }, {
    key: '_condenseHierarchy',
    value: function _condenseHierarchy(distribution) {}

    /**
     * This function places the nodes on the canvas based on the hierarchial distribution.
     *
     * @param {Object} distribution | obtained by the function this._getDistribution()
     * @private
     */
  }, {
    key: '_placeNodesByHierarchy',
    value: function _placeNodesByHierarchy(distribution) {
      this.positionedNodes = {};
      // start placing all the level 0 nodes first. Then recursively position their branches.
      for (var level in distribution) {
        if (distribution.hasOwnProperty(level)) {
          // sort nodes in level by position:
          var nodeArray = Object.keys(distribution[level]);
          nodeArray = this._indexArrayToNodes(nodeArray);
          this._sortNodeArray(nodeArray);

          for (var i = 0; i < nodeArray.length; i++) {
            var node = nodeArray[i];
            if (this.positionedNodes[node.id] === undefined) {
              this._setPositionForHierarchy(node, this.nodeSpacing * i);
              this.positionedNodes[node.id] = true;
              this._placeBranchNodes(node.id, level);
            }
          }
        }
      }
    }

    /**
     * Receives an array with node indices and returns an array with the actual node references. Used for sorting based on
     * node properties.
     * @param idArray
     */
  }, {
    key: '_indexArrayToNodes',
    value: function _indexArrayToNodes(idArray) {
      var array = [];
      for (var i = 0; i < idArray.length; i++) {
        array.push(this.body.nodes[idArray[i]]);
      }
      return array;
    }

    /**
     * This function get the distribution of levels based on hubsize
     *
     * @returns {Object}
     * @private
     */
  }, {
    key: '_getDistribution',
    value: function _getDistribution() {
      var distribution = {};
      var nodeId = undefined,
          node = undefined;

      // we fix Y because the hierarchy is vertical, we fix X so we do not give a node an x position for a second time.
      // the fix of X is removed after the x value has been set.
      for (nodeId in this.body.nodes) {
        if (this.body.nodes.hasOwnProperty(nodeId)) {
          node = this.body.nodes[nodeId];
          var level = this.hierarchicalLevels[nodeId] === undefined ? 0 : this.hierarchicalLevels[nodeId];
          if (this.options.hierarchical.direction === 'UD' || this.options.hierarchical.direction === 'DU') {
            node.y = this.options.hierarchical.levelSeparation * level;
            node.options.fixed.y = true;
          } else {
            node.x = this.options.hierarchical.levelSeparation * level;
            node.options.fixed.x = true;
          }
          if (distribution[level] === undefined) {
            distribution[level] = {};
          }
          distribution[level][nodeId] = node;
        }
      }
      return distribution;
    }

    /**
     * Get the hubsize from all remaining unlevelled nodes.
     *
     * @returns {number}
     * @private
     */
  }, {
    key: '_getHubSize',
    value: function _getHubSize() {
      var hubSize = 0;
      for (var nodeId in this.body.nodes) {
        if (this.body.nodes.hasOwnProperty(nodeId)) {
          var node = this.body.nodes[nodeId];
          if (this.hierarchicalLevels[nodeId] === undefined) {
            hubSize = node.edges.length < hubSize ? hubSize : node.edges.length;
          }
        }
      }
      return hubSize;
    }

    /**
     * this function allocates nodes in levels based on the recursive branching from the largest hubs.
     *
     * @param hubsize
     * @private
     */
  }, {
    key: '_determineLevelsByHubsize',
    value: function _determineLevelsByHubsize() {
      var _this2 = this;

      var hubSize = 1;

      var levelDownstream = function levelDownstream(nodeA, nodeB) {
        if (_this2.hierarchicalLevels[nodeB.id] === undefined) {
          // set initial level
          if (_this2.hierarchicalLevels[nodeA.id] === undefined) {
            _this2.hierarchicalLevels[nodeA.id] = 0;
          }
          // set level
          _this2.hierarchicalLevels[nodeB.id] = _this2.hierarchicalLevels[nodeA.id] + 1;
        }
      };

      while (hubSize > 0) {
        // determine hubs
        hubSize = this._getHubSize();
        if (hubSize === 0) break;

        for (var nodeId in this.body.nodes) {
          if (this.body.nodes.hasOwnProperty(nodeId)) {
            var node = this.body.nodes[nodeId];
            if (node.edges.length === hubSize) {
              this._crawlNetwork(levelDownstream, nodeId);
            }
          }
        }
      }
    }

    /**
     * TODO: release feature
     * @private
     */
  }, {
    key: '_determineLevelsCustomCallback',
    value: function _determineLevelsCustomCallback() {
      var _this3 = this;

      var minLevel = 100000;

      // TODO: this should come from options.
      var customCallback = function customCallback(nodeA, nodeB, edge) {};

      var levelByDirection = function levelByDirection(nodeA, nodeB, edge) {
        var levelA = _this3.hierarchicalLevels[nodeA.id];
        // set initial level
        if (levelA === undefined) {
          _this3.hierarchicalLevels[nodeA.id] = minLevel;
        }

        var diff = customCallback(_NetworkUtil2['default']._cloneOptions(nodeA, 'node'), _NetworkUtil2['default']._cloneOptions(nodeB, 'node'), _NetworkUtil2['default']._cloneOptions(edge, 'edge'));

        _this3.hierarchicalLevels[nodeB.id] = _this3.hierarchicalLevels[nodeA.id] + diff;
      };

      this._crawlNetwork(levelByDirection);
      this._setMinLevelToZero();
    }

    /**
     * this function allocates nodes in levels based on the direction of the edges
     *
     * @param hubsize
     * @private
     */
  }, {
    key: '_determineLevelsDirected',
    value: function _determineLevelsDirected() {
      var _this4 = this;

      var minLevel = 10000;
      var levelByDirection = function levelByDirection(nodeA, nodeB, edge) {
        var levelA = _this4.hierarchicalLevels[nodeA.id];
        // set initial level
        if (levelA === undefined) {
          _this4.hierarchicalLevels[nodeA.id] = minLevel;
        }
        if (edge.toId == nodeB.id) {
          _this4.hierarchicalLevels[nodeB.id] = _this4.hierarchicalLevels[nodeA.id] + 1;
        } else {
          _this4.hierarchicalLevels[nodeB.id] = _this4.hierarchicalLevels[nodeA.id] - 1;
        }
      };
      this._crawlNetwork(levelByDirection);
      this._setMinLevelToZero();
    }

    /**
     * Small util method to set the minimum levels of the nodes to zero.
     * @private
     */
  }, {
    key: '_setMinLevelToZero',
    value: function _setMinLevelToZero() {
      var minLevel = 1e9;
      // get the minimum level
      for (var nodeId in this.body.nodes) {
        if (this.body.nodes.hasOwnProperty(nodeId)) {
          minLevel = Math.min(this.hierarchicalLevels[nodeId], minLevel);
        }
      }

      // subtract the minimum from the set so we have a range starting from 0
      for (var nodeId in this.body.nodes) {
        if (this.body.nodes.hasOwnProperty(nodeId)) {
          this.hierarchicalLevels[nodeId] -= minLevel;
        }
      }
    }

    /**
     * Update the bookkeeping of parent and child.
     * @param parentNodeId
     * @param childNodeId
     * @private
     */
  }, {
    key: '_generateMap',
    value: function _generateMap() {
      var _this5 = this;

      var fillInRelations = function fillInRelations(parentNode, childNode) {
        if (_this5.hierarchicalLevels[childNode.id] > _this5.hierarchicalLevels[parentNode.id]) {
          var parentNodeId = parentNode.id;
          var childNodeId = childNode.id;
          if (_this5.hierarchicalParents[parentNodeId] === undefined) {
            _this5.hierarchicalParents[parentNodeId] = { children: [], amount: 0 };
          }
          _this5.hierarchicalParents[parentNodeId].children.push(childNodeId);
          if (_this5.hierarchicalChildren[childNodeId] === undefined) {
            _this5.hierarchicalChildren[childNodeId] = { parents: [], amount: 0 };
          }
          _this5.hierarchicalChildren[childNodeId].parents.push(parentNodeId);
        }
      };

      this._crawlNetwork(fillInRelations);
    }

    /**
     * Crawl over the entire network and use a callback on each node couple that is connected to eachother.
     * @param callback          | will receive nodeA nodeB and the connecting edge. A and B are unique.
     * @param startingNodeId
     * @private
     */
  }, {
    key: '_crawlNetwork',
    value: function _crawlNetwork(callback, startingNodeId) {
      if (callback === undefined) callback = function () {};

      var progress = {};
      var crawler = function crawler(node) {
        if (progress[node.id] === undefined) {
          progress[node.id] = true;
          var childNode = undefined;
          for (var i = 0; i < node.edges.length; i++) {
            if (node.edges[i].toId === node.id) {
              childNode = node.edges[i].from;
            } else {
              childNode = node.edges[i].to;
            }

            if (node.id !== childNode.id) {
              callback(node, childNode, node.edges[i]);
              crawler(childNode);
            }
          }
        }
      };

      // we can crawl from a specific node or over all nodes.
      if (startingNodeId === undefined) {
        for (var i = 0; i < this.body.nodeIndices.length; i++) {
          var node = this.body.nodes[this.body.nodeIndices[i]];
          crawler(node);
        }
      } else {
        var node = this.body.nodes[startingNodeId];
        if (node === undefined) {
          console.error("Node not found:", startingNodeId);
          return;
        }
        crawler(node);
      }
    }

    /**
     * This is a recursively called function to enumerate the branches from the largest hubs and place the nodes
     * on a X position that ensures there will be no overlap.
     *
     * @param parentId
     * @param parentLevel
     * @private
     */
  }, {
    key: '_placeBranchNodes',
    value: function _placeBranchNodes(parentId, parentLevel) {
      // if this is not a parent, cancel the placing. This can happen with multiple parents to one child.
      if (this.hierarchicalParents[parentId] === undefined) {
        return;
      }

      // get a list of childNodes
      var childNodes = [];
      for (var i = 0; i < this.hierarchicalParents[parentId].children.length; i++) {
        childNodes.push(this.body.nodes[this.hierarchicalParents[parentId].children[i]]);
      }

      // use the positions to order the nodes.
      this._sortNodeArray(childNodes);

      // position the childNodes
      for (var i = 0; i < childNodes.length; i++) {
        var childNode = childNodes[i];
        var childNodeLevel = this.hierarchicalLevels[childNode.id];
        // check if the childnode is below the parent node and if it has already been positioned.
        if (childNodeLevel > parentLevel && this.positionedNodes[childNode.id] === undefined) {
          // get the amount of space required for this node. If parent the width is based on the amount of children.
          var pos = undefined;

          // we get the X or Y values we need and store them in pos and previousPos. The get and set make sure we get X or Y
          if (i === 0) {
            pos = this._getPositionForHierarchy(this.body.nodes[parentId]);
          } else {
            pos = this._getPositionForHierarchy(childNodes[i - 1]) + this.nodeSpacing;
          }
          this._setPositionForHierarchy(childNode, pos);

          // if overlap has been detected, we shift the branch
          if (this.lastNodeOnLevel[childNodeLevel] !== undefined) {
            var previousPos = this._getPositionForHierarchy(this.body.nodes[this.lastNodeOnLevel[childNodeLevel]]);
            if (pos - previousPos < this.nodeSpacing) {
              var diff = previousPos + this.nodeSpacing - pos;
              var sharedParent = this._findCommonParent(this.lastNodeOnLevel[childNodeLevel], childNode.id);
              this._shiftBlock(sharedParent.withChild, diff);
            }
          }

          // store change in position.
          this.lastNodeOnLevel[childNodeLevel] = childNode.id;

          this.positionedNodes[childNode.id] = true;

          this._placeBranchNodes(childNode.id, childNodeLevel);
        } else {
          return;
        }
      }

      // center the parent nodes.
      var minPos = 1e9;
      var maxPos = -1e9;
      for (var i = 0; i < childNodes.length; i++) {
        var childNodeId = childNodes[i].id;
        minPos = Math.min(minPos, this._getPositionForHierarchy(this.body.nodes[childNodeId]));
        maxPos = Math.max(maxPos, this._getPositionForHierarchy(this.body.nodes[childNodeId]));
      }
      this._setPositionForHierarchy(this.body.nodes[parentId], 0.5 * (minPos + maxPos));
    }

    /**
     * Shift a branch a certain distance
     * @param parentId
     * @param diff
     * @private
     */
  }, {
    key: '_shiftBlock',
    value: function _shiftBlock(parentId, diff) {
      if (this.options.hierarchical.direction === 'UD' || this.options.hierarchical.direction === 'DU') {
        this.body.nodes[parentId].x += diff;
      } else {
        this.body.nodes[parentId].y += diff;
      }
      if (this.hierarchicalParents[parentId] !== undefined) {
        for (var i = 0; i < this.hierarchicalParents[parentId].children.length; i++) {
          this._shiftBlock(this.hierarchicalParents[parentId].children[i], diff);
        }
      }
    }

    /**
     * Find a common parent between branches.
     * @param childA
     * @param childB
     * @returns {{foundParent, withChild}}
     * @private
     */
  }, {
    key: '_findCommonParent',
    value: function _findCommonParent(childA, childB) {
      var _this6 = this;

      var parents = {};
      var iterateParents = function iterateParents(parents, child) {
        if (_this6.hierarchicalChildren[child] !== undefined) {
          for (var i = 0; i < _this6.hierarchicalChildren[child].parents.length; i++) {
            var _parent = _this6.hierarchicalChildren[child].parents[i];
            parents[_parent] = true;
            iterateParents(parents, _parent);
          }
        }
      };
      var findParent = function findParent(parents, child) {
        if (_this6.hierarchicalChildren[child] !== undefined) {
          for (var i = 0; i < _this6.hierarchicalChildren[child].parents.length; i++) {
            var _parent2 = _this6.hierarchicalChildren[child].parents[i];
            if (parents[_parent2] !== undefined) {
              return { foundParent: _parent2, withChild: child };
            }
            var branch = findParent(parents, _parent2);
            if (branch.foundParent !== null) {
              return branch;
            }
          }
        }
        return { foundParent: null, withChild: child };
      };

      iterateParents(parents, childA);
      return findParent(parents, childB);
    }

    /**
     * Abstract the getting of the position so we won't have to repeat the check for direction all the time
     * @param node
     * @param position
     * @private
     */
  }, {
    key: '_setPositionForHierarchy',
    value: function _setPositionForHierarchy(node, position) {
      if (this.options.hierarchical.direction === 'UD' || this.options.hierarchical.direction === 'DU') {
        node.x = position;
      } else {
        node.y = position;
      }
    }

    /**
     * Abstract the getting of the position of a node so we do not have to repeat the direction check all the time.
     * @param node
     * @returns {number|*}
     * @private
     */
  }, {
    key: '_getPositionForHierarchy',
    value: function _getPositionForHierarchy(node) {
      if (this.options.hierarchical.direction === 'UD' || this.options.hierarchical.direction === 'DU') {
        return node.x;
      } else {
        return node.y;
      }
    }

    /**
     * Use the x or y value to sort the array, allowing users to specify order.
     * @param nodeArray
     * @private
     */
  }, {
    key: '_sortNodeArray',
    value: function _sortNodeArray(nodeArray) {
      if (nodeArray.length > 1) {
        if (this.options.hierarchical.direction === 'UD' || this.options.hierarchical.direction === 'DU') {
          nodeArray.sort(function (a, b) {
            return a.x - b.x;
          });
        } else {
          nodeArray.sort(function (a, b) {
            return a.y - b.y;
          });
        }
      }
    }
  }]);

  return LayoutEngine;
})();

exports['default'] = LayoutEngine;
module.exports = exports['default'];

},{"../../util":73,"../NetworkUtil":11}],23:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var util = require('../../util');
var Hammer = require('../../module/hammer');
var hammerUtil = require('../../hammerUtil');

/**
 * clears the toolbar div element of children
 *
 * @private
 */

var ManipulationSystem = (function () {
  function ManipulationSystem(body, canvas, selectionHandler) {
    var _this = this;

    _classCallCheck(this, ManipulationSystem);

    this.body = body;
    this.canvas = canvas;
    this.selectionHandler = selectionHandler;

    this.editMode = false;
    this.manipulationDiv = undefined;
    this.editModeDiv = undefined;
    this.closeDiv = undefined;

    this.manipulationHammers = [];
    this.temporaryUIFunctions = {};
    this.temporaryEventFunctions = [];

    this.touchTime = 0;
    this.temporaryIds = { nodes: [], edges: [] };
    this.guiEnabled = false;
    this.inMode = false;
    this.selectedControlNode = undefined;

    this.options = {};
    this.defaultOptions = {
      enabled: false,
      initiallyActive: false,
      addNode: true,
      addEdge: true,
      editNode: undefined,
      editEdge: true,
      deleteNode: true,
      deleteEdge: true,
      controlNodeStyle: {
        shape: 'dot',
        size: 6,
        color: { background: '#ff0000', border: '#3c3c3c', highlight: { background: '#07f968', border: '#3c3c3c' } },
        borderWidth: 2,
        borderWidthSelected: 2
      }
    };
    util.extend(this.options, this.defaultOptions);

    this.body.emitter.on('destroy', function () {
      _this._clean();
    });
    this.body.emitter.on('_dataChanged', this._restore.bind(this));
    this.body.emitter.on('_resetData', this._restore.bind(this));
  }

  /**
   * If something changes in the data during editing, switch back to the initial datamanipulation state and close all edit modes.
   * @private
   */

  _createClass(ManipulationSystem, [{
    key: '_restore',
    value: function _restore() {
      if (this.inMode !== false) {
        if (this.options.initiallyActive === true) {
          this.enableEditMode();
        } else {
          this.disableEditMode();
        }
      }
    }

    /**
     * Set the Options
     * @param options
     */
  }, {
    key: 'setOptions',
    value: function setOptions(options, allOptions, globalOptions) {
      if (allOptions !== undefined) {
        if (allOptions.locale !== undefined) {
          this.options.locale = allOptions.locale;
        } else {
          this.options.locale = globalOptions.locale;
        }
        if (allOptions.locales !== undefined) {
          this.options.locales = allOptions.locales;
        } else {
          this.options.locales = globalOptions.locales;
        }
      }

      if (options !== undefined) {
        if (typeof options === 'boolean') {
          this.options.enabled = options;
        } else {
          this.options.enabled = true;
          util.deepExtend(this.options, options);
        }
        if (this.options.initiallyActive === true) {
          this.editMode = true;
        }
        this._setup();
      }
    }

    /**
     * Enable or disable edit-mode. Draws the DOM required and cleans up after itself.
     *
     * @private
     */
  }, {
    key: 'toggleEditMode',
    value: function toggleEditMode() {
      if (this.editMode === true) {
        this.disableEditMode();
      } else {
        this.enableEditMode();
      }
    }
  }, {
    key: 'enableEditMode',
    value: function enableEditMode() {
      this.editMode = true;

      this._clean();
      if (this.guiEnabled === true) {
        this.manipulationDiv.style.display = 'block';
        this.closeDiv.style.display = 'block';
        this.editModeDiv.style.display = 'none';
        this.showManipulatorToolbar();
      }
    }
  }, {
    key: 'disableEditMode',
    value: function disableEditMode() {
      this.editMode = false;

      this._clean();
      if (this.guiEnabled === true) {
        this.manipulationDiv.style.display = 'none';
        this.closeDiv.style.display = 'none';
        this.editModeDiv.style.display = 'block';
        this._createEditButton();
      }
    }

    /**
     * Creates the main toolbar. Removes functions bound to the select event. Binds all the buttons of the toolbar.
     *
     * @private
     */
  }, {
    key: 'showManipulatorToolbar',
    value: function showManipulatorToolbar() {
      // restore the state of any bound functions or events, remove control nodes, restore physics
      this._clean();

      // reset global letiables
      this.manipulationDOM = {};

      // if the gui is enabled, draw all elements.
      if (this.guiEnabled === true) {
        // a _restore will hide these menus
        this.editMode = true;
        this.manipulationDiv.style.display = 'block';
        this.closeDiv.style.display = 'block';

        var selectedNodeCount = this.selectionHandler._getSelectedNodeCount();
        var selectedEdgeCount = this.selectionHandler._getSelectedEdgeCount();
        var selectedTotalCount = selectedNodeCount + selectedEdgeCount;
        var locale = this.options.locales[this.options.locale];
        var needSeperator = false;

        if (this.options.addNode !== false) {
          this._createAddNodeButton(locale);
          needSeperator = true;
        }
        if (this.options.addEdge !== false) {
          if (needSeperator === true) {
            this._createSeperator(1);
          } else {
            needSeperator = true;
          }
          this._createAddEdgeButton(locale);
        }

        if (selectedNodeCount === 1 && typeof this.options.editNode === 'function') {
          if (needSeperator === true) {
            this._createSeperator(2);
          } else {
            needSeperator = true;
          }
          this._createEditNodeButton(locale);
        } else if (selectedEdgeCount === 1 && selectedNodeCount === 0 && this.options.editEdge !== false) {
          if (needSeperator === true) {
            this._createSeperator(3);
          } else {
            needSeperator = true;
          }
          this._createEditEdgeButton(locale);
        }

        // remove buttons
        if (selectedTotalCount !== 0) {
          if (selectedNodeCount > 0 && this.options.deleteNode !== false) {
            if (needSeperator === true) {
              this._createSeperator(4);
            }
            this._createDeleteButton(locale);
          } else if (selectedNodeCount === 0 && this.options.deleteEdge !== false) {
            if (needSeperator === true) {
              this._createSeperator(4);
            }
            this._createDeleteButton(locale);
          }
        }

        // bind the close button
        this._bindHammerToDiv(this.closeDiv, this.toggleEditMode.bind(this));

        // refresh this bar based on what has been selected
        this._temporaryBindEvent('select', this.showManipulatorToolbar.bind(this));
      }

      // redraw to show any possible changes
      this.body.emitter.emit('_redraw');
    }

    /**
     * Create the toolbar for adding Nodes
     */
  }, {
    key: 'addNodeMode',
    value: function addNodeMode() {
      // when using the gui, enable edit mode if it wasnt already.
      if (this.editMode !== true) {
        this.enableEditMode();
      }

      // restore the state of any bound functions or events, remove control nodes, restore physics
      this._clean();

      this.inMode = 'addNode';
      if (this.guiEnabled === true) {
        var locale = this.options.locales[this.options.locale];
        this.manipulationDOM = {};
        this._createBackButton(locale);
        this._createSeperator();
        this._createDescription(locale['addDescription'] || this.options.locales['en']['addDescription']);

        // bind the close button
        this._bindHammerToDiv(this.closeDiv, this.toggleEditMode.bind(this));
      }

      this._temporaryBindEvent('click', this._performAddNode.bind(this));
    }

    /**
     * call the bound function to handle the editing of the node. The node has to be selected.
     */
  }, {
    key: 'editNode',
    value: function editNode() {
      var _this2 = this;

      // when using the gui, enable edit mode if it wasnt already.
      if (this.editMode !== true) {
        this.enableEditMode();
      }

      // restore the state of any bound functions or events, remove control nodes, restore physics
      this._clean();
      var node = this.selectionHandler._getSelectedNode();
      if (node !== undefined) {
        this.inMode = 'editNode';
        if (typeof this.options.editNode === 'function') {
          if (node.isCluster !== true) {
            var data = util.deepExtend({}, node.options, true);
            data.x = node.x;
            data.y = node.y;

            if (this.options.editNode.length === 2) {
              this.options.editNode(data, function (finalizedData) {
                if (finalizedData !== null && finalizedData !== undefined && _this2.inMode === 'editNode') {
                  // if for whatever reason the mode has changes (due to dataset change) disregard the callback) {
                  _this2.body.data.nodes.getDataSet().update(finalizedData);
                }
                _this2.showManipulatorToolbar();
              });
            } else {
              throw new Error('The function for edit does not support two arguments (data, callback)');
            }
          } else {
            alert(this.options.locales[this.options.locale]['editClusterError'] || this.options.locales['en']['editClusterError']);
          }
        } else {
          throw new Error('No function has been configured to handle the editing of nodes.');
        }
      } else {
        this.showManipulatorToolbar();
      }
    }

    /**
     * create the toolbar to connect nodes
     */
  }, {
    key: 'addEdgeMode',
    value: function addEdgeMode() {
      // when using the gui, enable edit mode if it wasnt already.
      if (this.editMode !== true) {
        this.enableEditMode();
      }

      // restore the state of any bound functions or events, remove control nodes, restore physics
      this._clean();

      this.inMode = 'addEdge';
      if (this.guiEnabled === true) {
        var locale = this.options.locales[this.options.locale];
        this.manipulationDOM = {};
        this._createBackButton(locale);
        this._createSeperator();
        this._createDescription(locale['edgeDescription'] || this.options.locales['en']['edgeDescription']);

        // bind the close button
        this._bindHammerToDiv(this.closeDiv, this.toggleEditMode.bind(this));
      }

      // temporarily overload functions
      this._temporaryBindUI('onTouch', this._handleConnect.bind(this));
      this._temporaryBindUI('onDragEnd', this._finishConnect.bind(this));
      this._temporaryBindUI('onDrag', this._dragControlNode.bind(this));
      this._temporaryBindUI('onRelease', this._finishConnect.bind(this));

      this._temporaryBindUI('onDragStart', function () {});
      this._temporaryBindUI('onHold', function () {});
    }

    /**
     * create the toolbar to edit edges
     */
  }, {
    key: 'editEdgeMode',
    value: function editEdgeMode() {
      var _this3 = this;

      // when using the gui, enable edit mode if it wasnt already.
      if (this.editMode !== true) {
        this.enableEditMode();
      }

      // restore the state of any bound functions or events, remove control nodes, restore physics
      this._clean();

      this.inMode = 'editEdge';
      if (this.guiEnabled === true) {
        var locale = this.options.locales[this.options.locale];
        this.manipulationDOM = {};
        this._createBackButton(locale);
        this._createSeperator();
        this._createDescription(locale['editEdgeDescription'] || this.options.locales['en']['editEdgeDescription']);

        // bind the close button
        this._bindHammerToDiv(this.closeDiv, this.toggleEditMode.bind(this));
      }

      this.edgeBeingEditedId = this.selectionHandler.getSelectedEdges()[0];
      if (this.edgeBeingEditedId !== undefined) {
        (function () {
          var edge = _this3.body.edges[_this3.edgeBeingEditedId];

          // create control nodes
          var controlNodeFrom = _this3._getNewTargetNode(edge.from.x, edge.from.y);
          var controlNodeTo = _this3._getNewTargetNode(edge.to.x, edge.to.y);

          _this3.temporaryIds.nodes.push(controlNodeFrom.id);
          _this3.temporaryIds.nodes.push(controlNodeTo.id);

          _this3.body.nodes[controlNodeFrom.id] = controlNodeFrom;
          _this3.body.nodeIndices.push(controlNodeFrom.id);
          _this3.body.nodes[controlNodeTo.id] = controlNodeTo;
          _this3.body.nodeIndices.push(controlNodeTo.id);

          // temporarily overload UI functions, cleaned up automatically because of _temporaryBindUI
          _this3._temporaryBindUI('onTouch', _this3._controlNodeTouch.bind(_this3)); // used to get the position
          _this3._temporaryBindUI('onTap', function () {}); // disabled
          _this3._temporaryBindUI('onHold', function () {}); // disabled
          _this3._temporaryBindUI('onDragStart', _this3._controlNodeDragStart.bind(_this3)); // used to select control node
          _this3._temporaryBindUI('onDrag', _this3._controlNodeDrag.bind(_this3)); // used to drag control node
          _this3._temporaryBindUI('onDragEnd', _this3._controlNodeDragEnd.bind(_this3)); // used to connect or revert control nodes
          _this3._temporaryBindUI('onMouseMove', function () {}); // disabled

          // create function to position control nodes correctly on movement
          // automatically cleaned up because we use the temporary bind
          _this3._temporaryBindEvent('beforeDrawing', function (ctx) {
            var positions = edge.edgeType.findBorderPositions(ctx);
            if (controlNodeFrom.selected === false) {
              controlNodeFrom.x = positions.from.x;
              controlNodeFrom.y = positions.from.y;
            }
            if (controlNodeTo.selected === false) {
              controlNodeTo.x = positions.to.x;
              controlNodeTo.y = positions.to.y;
            }
          });

          _this3.body.emitter.emit('_redraw');
        })();
      } else {
        this.showManipulatorToolbar();
      }
    }

    /**
     * delete everything in the selection
     */
  }, {
    key: 'deleteSelected',
    value: function deleteSelected() {
      var _this4 = this;

      // when using the gui, enable edit mode if it wasnt already.
      if (this.editMode !== true) {
        this.enableEditMode();
      }

      // restore the state of any bound functions or events, remove control nodes, restore physics
      this._clean();

      this.inMode = 'delete';
      var selectedNodes = this.selectionHandler.getSelectedNodes();
      var selectedEdges = this.selectionHandler.getSelectedEdges();
      var deleteFunction = undefined;
      if (selectedNodes.length > 0) {
        for (var i = 0; i < selectedNodes.length; i++) {
          if (this.body.nodes[selectedNodes[i]].isCluster === true) {
            alert(this.options.locales[this.options.locale]['deleteClusterError'] || this.options.locales['en']['deleteClusterError']);
            return;
          }
        }

        if (typeof this.options.deleteNode === 'function') {
          deleteFunction = this.options.deleteNode;
        }
      } else if (selectedEdges.length > 0) {
        if (typeof this.options.deleteEdge === 'function') {
          deleteFunction = this.options.deleteEdge;
        }
      }

      if (typeof deleteFunction === 'function') {
        var data = { nodes: selectedNodes, edges: selectedEdges };
        if (deleteFunction.length === 2) {
          deleteFunction(data, function (finalizedData) {
            if (finalizedData !== null && finalizedData !== undefined && _this4.inMode === 'delete') {
              // if for whatever reason the mode has changes (due to dataset change) disregard the callback) {
              _this4.body.data.edges.getDataSet().remove(finalizedData.edges);
              _this4.body.data.nodes.getDataSet().remove(finalizedData.nodes);
              _this4.body.emitter.emit('startSimulation');
              _this4.showManipulatorToolbar();
            } else {
              _this4.body.emitter.emit('startSimulation');
              _this4.showManipulatorToolbar();
            }
          });
        } else {
          throw new Error('The function for delete does not support two arguments (data, callback)');
        }
      } else {
        this.body.data.edges.getDataSet().remove(selectedEdges);
        this.body.data.nodes.getDataSet().remove(selectedNodes);
        this.body.emitter.emit('startSimulation');
        this.showManipulatorToolbar();
      }
    }

    //********************************************** PRIVATE ***************************************//

    /**
     * draw or remove the DOM
     * @private
     */
  }, {
    key: '_setup',
    value: function _setup() {
      if (this.options.enabled === true) {
        // Enable the GUI
        this.guiEnabled = true;

        this._createWrappers();
        if (this.editMode === false) {
          this._createEditButton();
        } else {
          this.showManipulatorToolbar();
        }
      } else {
        this._removeManipulationDOM();

        // disable the gui
        this.guiEnabled = false;
      }
    }

    /**
     * create the div overlays that contain the DOM
     * @private
     */
  }, {
    key: '_createWrappers',
    value: function _createWrappers() {
      // load the manipulator HTML elements. All styling done in css.
      if (this.manipulationDiv === undefined) {
        this.manipulationDiv = document.createElement('div');
        this.manipulationDiv.className = 'vis-manipulation';
        if (this.editMode === true) {
          this.manipulationDiv.style.display = 'block';
        } else {
          this.manipulationDiv.style.display = 'none';
        }
        this.canvas.frame.appendChild(this.manipulationDiv);
      }

      // container for the edit button.
      if (this.editModeDiv === undefined) {
        this.editModeDiv = document.createElement('div');
        this.editModeDiv.className = 'vis-edit-mode';
        if (this.editMode === true) {
          this.editModeDiv.style.display = 'none';
        } else {
          this.editModeDiv.style.display = 'block';
        }
        this.canvas.frame.appendChild(this.editModeDiv);
      }

      // container for the close div button
      if (this.closeDiv === undefined) {
        this.closeDiv = document.createElement('div');
        this.closeDiv.className = 'vis-close';
        this.closeDiv.style.display = this.manipulationDiv.style.display;
        this.canvas.frame.appendChild(this.closeDiv);
      }
    }

    /**
     * generate a new target node. Used for creating new edges and editing edges
     * @param x
     * @param y
     * @returns {*}
     * @private
     */
  }, {
    key: '_getNewTargetNode',
    value: function _getNewTargetNode(x, y) {
      var controlNodeStyle = util.deepExtend({}, this.options.controlNodeStyle);

      controlNodeStyle.id = 'targetNode' + util.randomUUID();
      controlNodeStyle.hidden = false;
      controlNodeStyle.physics = false;
      controlNodeStyle.x = x;
      controlNodeStyle.y = y;

      return this.body.functions.createNode(controlNodeStyle);
    }

    /**
     * Create the edit button
     */
  }, {
    key: '_createEditButton',
    value: function _createEditButton() {
      // restore everything to it's original state (if applicable)
      this._clean();

      // reset the manipulationDOM
      this.manipulationDOM = {};

      // empty the editModeDiv
      util.recursiveDOMDelete(this.editModeDiv);

      // create the contents for the editMode button
      var locale = this.options.locales[this.options.locale];
      var button = this._createButton('editMode', 'vis-button vis-edit vis-edit-mode', locale['edit'] || this.options.locales['en']['edit']);
      this.editModeDiv.appendChild(button);

      // bind a hammer listener to the button, calling the function toggleEditMode.
      this._bindHammerToDiv(button, this.toggleEditMode.bind(this));
    }

    /**
     * this function cleans up after everything this module does. Temporary elements, functions and events are removed, physics restored, hammers removed.
     * @private
     */
  }, {
    key: '_clean',
    value: function _clean() {
      // not in mode
      this.inMode = false;

      // _clean the divs
      if (this.guiEnabled === true) {
        util.recursiveDOMDelete(this.editModeDiv);
        util.recursiveDOMDelete(this.manipulationDiv);

        // removes all the bindings and overloads
        this._cleanManipulatorHammers();
      }

      // remove temporary nodes and edges
      this._cleanupTemporaryNodesAndEdges();

      // restore overloaded UI functions
      this._unbindTemporaryUIs();

      // remove the temporaryEventFunctions
      this._unbindTemporaryEvents();

      // restore the physics if required
      this.body.emitter.emit('restorePhysics');
    }

    /**
     * Each dom element has it's own hammer. They are stored in this.manipulationHammers. This cleans them up.
     * @private
     */
  }, {
    key: '_cleanManipulatorHammers',
    value: function _cleanManipulatorHammers() {
      // _clean hammer bindings
      if (this.manipulationHammers.length != 0) {
        for (var i = 0; i < this.manipulationHammers.length; i++) {
          this.manipulationHammers[i].destroy();
        }
        this.manipulationHammers = [];
      }
    }

    /**
     * Remove all DOM elements created by this module.
     * @private
     */
  }, {
    key: '_removeManipulationDOM',
    value: function _removeManipulationDOM() {
      // removes all the bindings and overloads
      this._clean();

      // empty the manipulation divs
      util.recursiveDOMDelete(this.manipulationDiv);
      util.recursiveDOMDelete(this.editModeDiv);
      util.recursiveDOMDelete(this.closeDiv);

      // remove the manipulation divs
      if (this.manipulationDiv) {
        this.canvas.frame.removeChild(this.manipulationDiv);
      }
      if (this.editModeDiv) {
        this.canvas.frame.removeChild(this.editModeDiv);
      }
      if (this.closeDiv) {
        this.canvas.frame.removeChild(this.manipulationDiv);
      }

      // set the references to undefined
      this.manipulationDiv = undefined;
      this.editModeDiv = undefined;
      this.closeDiv = undefined;
    }

    /**
     * create a seperator line. the index is to differentiate in the manipulation dom
     * @param index
     * @private
     */
  }, {
    key: '_createSeperator',
    value: function _createSeperator() {
      var index = arguments.length <= 0 || arguments[0] === undefined ? 1 : arguments[0];

      this.manipulationDOM['seperatorLineDiv' + index] = document.createElement('div');
      this.manipulationDOM['seperatorLineDiv' + index].className = 'vis-separator-line';
      this.manipulationDiv.appendChild(this.manipulationDOM['seperatorLineDiv' + index]);
    }

    // ----------------------    DOM functions for buttons    --------------------------//

  }, {
    key: '_createAddNodeButton',
    value: function _createAddNodeButton(locale) {
      var button = this._createButton('addNode', 'vis-button vis-add', locale['addNode'] || this.options.locales['en']['addNode']);
      this.manipulationDiv.appendChild(button);
      this._bindHammerToDiv(button, this.addNodeMode.bind(this));
    }
  }, {
    key: '_createAddEdgeButton',
    value: function _createAddEdgeButton(locale) {
      var button = this._createButton('addEdge', 'vis-button vis-connect', locale['addEdge'] || this.options.locales['en']['addEdge']);
      this.manipulationDiv.appendChild(button);
      this._bindHammerToDiv(button, this.addEdgeMode.bind(this));
    }
  }, {
    key: '_createEditNodeButton',
    value: function _createEditNodeButton(locale) {
      var button = this._createButton('editNode', 'vis-button vis-edit', locale['editNode'] || this.options.locales['en']['editNode']);
      this.manipulationDiv.appendChild(button);
      this._bindHammerToDiv(button, this.editNode.bind(this));
    }
  }, {
    key: '_createEditEdgeButton',
    value: function _createEditEdgeButton(locale) {
      var button = this._createButton('editEdge', 'vis-button vis-edit', locale['editEdge'] || this.options.locales['en']['editEdge']);
      this.manipulationDiv.appendChild(button);
      this._bindHammerToDiv(button, this.editEdgeMode.bind(this));
    }
  }, {
    key: '_createDeleteButton',
    value: function _createDeleteButton(locale) {
      var button = this._createButton('delete', 'vis-button vis-delete', locale['del'] || this.options.locales['en']['del']);
      this.manipulationDiv.appendChild(button);
      this._bindHammerToDiv(button, this.deleteSelected.bind(this));
    }
  }, {
    key: '_createBackButton',
    value: function _createBackButton(locale) {
      var button = this._createButton('back', 'vis-button vis-back', locale['back'] || this.options.locales['en']['back']);
      this.manipulationDiv.appendChild(button);
      this._bindHammerToDiv(button, this.showManipulatorToolbar.bind(this));
    }
  }, {
    key: '_createButton',
    value: function _createButton(id, className, label) {
      var labelClassName = arguments.length <= 3 || arguments[3] === undefined ? 'vis-label' : arguments[3];

      this.manipulationDOM[id + 'Div'] = document.createElement('div');
      this.manipulationDOM[id + 'Div'].className = className;
      this.manipulationDOM[id + 'Label'] = document.createElement('div');
      this.manipulationDOM[id + 'Label'].className = labelClassName;
      this.manipulationDOM[id + 'Label'].innerHTML = label;
      this.manipulationDOM[id + 'Div'].appendChild(this.manipulationDOM[id + 'Label']);
      return this.manipulationDOM[id + 'Div'];
    }
  }, {
    key: '_createDescription',
    value: function _createDescription(label) {
      this.manipulationDiv.appendChild(this._createButton('description', 'vis-button vis-none', label));
    }

    // -------------------------- End of DOM functions for buttons ------------------------------//

    /**
     * this binds an event until cleanup by the clean functions.
     * @param event
     * @param newFunction
     * @private
     */
  }, {
    key: '_temporaryBindEvent',
    value: function _temporaryBindEvent(event, newFunction) {
      this.temporaryEventFunctions.push({ event: event, boundFunction: newFunction });
      this.body.emitter.on(event, newFunction);
    }

    /**
     * this overrides an UI function until cleanup by the clean function
     * @param UIfunctionName
     * @param newFunction
     * @private
     */
  }, {
    key: '_temporaryBindUI',
    value: function _temporaryBindUI(UIfunctionName, newFunction) {
      if (this.body.eventListeners[UIfunctionName] !== undefined) {
        this.temporaryUIFunctions[UIfunctionName] = this.body.eventListeners[UIfunctionName];
        this.body.eventListeners[UIfunctionName] = newFunction;
      } else {
        throw new Error('This UI function does not exist. Typo? You tried: ' + UIfunctionName + ' possible are: ' + JSON.stringify(Object.keys(this.body.eventListeners)));
      }
    }

    /**
     * Restore the overridden UI functions to their original state.
     *
     * @private
     */
  }, {
    key: '_unbindTemporaryUIs',
    value: function _unbindTemporaryUIs() {
      for (var functionName in this.temporaryUIFunctions) {
        if (this.temporaryUIFunctions.hasOwnProperty(functionName)) {
          this.body.eventListeners[functionName] = this.temporaryUIFunctions[functionName];
          delete this.temporaryUIFunctions[functionName];
        }
      }
      this.temporaryUIFunctions = {};
    }

    /**
     * Unbind the events created by _temporaryBindEvent
     * @private
     */
  }, {
    key: '_unbindTemporaryEvents',
    value: function _unbindTemporaryEvents() {
      for (var i = 0; i < this.temporaryEventFunctions.length; i++) {
        var eventName = this.temporaryEventFunctions[i].event;
        var boundFunction = this.temporaryEventFunctions[i].boundFunction;
        this.body.emitter.off(eventName, boundFunction);
      }
      this.temporaryEventFunctions = [];
    }

    /**
     * Bind an hammer instance to a DOM element.
     * @param domElement
     * @param funct
     */
  }, {
    key: '_bindHammerToDiv',
    value: function _bindHammerToDiv(domElement, boundFunction) {
      var hammer = new Hammer(domElement, {});
      hammerUtil.onTouch(hammer, boundFunction);
      this.manipulationHammers.push(hammer);
    }

    /**
     * Neatly clean up temporary edges and nodes
     * @private
     */
  }, {
    key: '_cleanupTemporaryNodesAndEdges',
    value: function _cleanupTemporaryNodesAndEdges() {
      // _clean temporary edges
      for (var i = 0; i < this.temporaryIds.edges.length; i++) {
        this.body.edges[this.temporaryIds.edges[i]].disconnect();
        delete this.body.edges[this.temporaryIds.edges[i]];
        var indexTempEdge = this.body.edgeIndices.indexOf(this.temporaryIds.edges[i]);
        if (indexTempEdge !== -1) {
          this.body.edgeIndices.splice(indexTempEdge, 1);
        }
      }

      // _clean temporary nodes
      for (var i = 0; i < this.temporaryIds.nodes.length; i++) {
        delete this.body.nodes[this.temporaryIds.nodes[i]];
        var indexTempNode = this.body.nodeIndices.indexOf(this.temporaryIds.nodes[i]);
        if (indexTempNode !== -1) {
          this.body.nodeIndices.splice(indexTempNode, 1);
        }
      }

      this.temporaryIds = { nodes: [], edges: [] };
    }

    // ------------------------------------------ EDIT EDGE FUNCTIONS -----------------------------------------//

    /**
     * the touch is used to get the position of the initial click
     * @param event
     * @private
     */
  }, {
    key: '_controlNodeTouch',
    value: function _controlNodeTouch(event) {
      this.selectionHandler.unselectAll();
      this.lastTouch = this.body.functions.getPointer(event.center);
      this.lastTouch.translation = util.extend({}, this.body.view.translation); // copy the object
    }

    /**
     * the drag start is used to mark one of the control nodes as selected.
     * @param event
     * @private
     */
  }, {
    key: '_controlNodeDragStart',
    value: function _controlNodeDragStart(event) {
      var pointer = this.lastTouch;
      var pointerObj = this.selectionHandler._pointerToPositionObject(pointer);
      var from = this.body.nodes[this.temporaryIds.nodes[0]];
      var to = this.body.nodes[this.temporaryIds.nodes[1]];
      var edge = this.body.edges[this.edgeBeingEditedId];
      this.selectedControlNode = undefined;

      var fromSelect = from.isOverlappingWith(pointerObj);
      var toSelect = to.isOverlappingWith(pointerObj);

      if (fromSelect === true) {
        this.selectedControlNode = from;
        edge.edgeType.from = from;
      } else if (toSelect === true) {
        this.selectedControlNode = to;
        edge.edgeType.to = to;
      }

      this.body.emitter.emit('_redraw');
    }

    /**
     * dragging the control nodes or the canvas
     * @param event
     * @private
     */
  }, {
    key: '_controlNodeDrag',
    value: function _controlNodeDrag(event) {
      this.body.emitter.emit('disablePhysics');
      var pointer = this.body.functions.getPointer(event.center);
      var pos = this.canvas.DOMtoCanvas(pointer);

      if (this.selectedControlNode !== undefined) {
        this.selectedControlNode.x = pos.x;
        this.selectedControlNode.y = pos.y;
      } else {
        // if the drag was not started properly because the click started outside the network div, start it now.
        var diffX = pointer.x - this.lastTouch.x;
        var diffY = pointer.y - this.lastTouch.y;
        this.body.view.translation = { x: this.lastTouch.translation.x + diffX, y: this.lastTouch.translation.y + diffY };
      }
      this.body.emitter.emit('_redraw');
    }

    /**
     * connecting or restoring the control nodes.
     * @param event
     * @private
     */
  }, {
    key: '_controlNodeDragEnd',
    value: function _controlNodeDragEnd(event) {
      var pointer = this.body.functions.getPointer(event.center);
      var pointerObj = this.selectionHandler._pointerToPositionObject(pointer);
      var edge = this.body.edges[this.edgeBeingEditedId];

      // if the node that was dragged is not a control node, return
      if (this.selectedControlNode === undefined) {
        return;
      }

      var overlappingNodeIds = this.selectionHandler._getAllNodesOverlappingWith(pointerObj);
      var node = undefined;
      for (var i = overlappingNodeIds.length - 1; i >= 0; i--) {
        if (overlappingNodeIds[i] !== this.selectedControlNode.id) {
          node = this.body.nodes[overlappingNodeIds[i]];
          break;
        }
      }

      // perform the connection
      if (node !== undefined && this.selectedControlNode !== undefined) {
        if (node.isCluster === true) {
          alert(this.options.locales[this.options.locale]['createEdgeError'] || this.options.locales['en']['createEdgeError']);
        } else {
          var from = this.body.nodes[this.temporaryIds.nodes[0]];
          if (this.selectedControlNode.id === from.id) {
            this._performEditEdge(node.id, edge.to.id);
          } else {
            this._performEditEdge(edge.from.id, node.id);
          }
        }
      } else {
        edge.updateEdgeType();
        this.body.emitter.emit('restorePhysics');
      }
      this.body.emitter.emit('_redraw');
    }

    // ------------------------------------ END OF EDIT EDGE FUNCTIONS -----------------------------------------//

    // ------------------------------------------- ADD EDGE FUNCTIONS -----------------------------------------//
    /**
     * the function bound to the selection event. It checks if you want to connect a cluster and changes the description
     * to walk the user through the process.
     *
     * @private
     */
  }, {
    key: '_handleConnect',
    value: function _handleConnect(event) {
      // check to avoid double fireing of this function.
      if (new Date().valueOf() - this.touchTime > 100) {
        this.lastTouch = this.body.functions.getPointer(event.center);
        this.lastTouch.translation = util.extend({}, this.body.view.translation); // copy the object

        var pointer = this.lastTouch;
        var node = this.selectionHandler.getNodeAt(pointer);

        if (node !== undefined) {
          if (node.isCluster === true) {
            alert(this.options.locales[this.options.locale]['createEdgeError'] || this.options.locales['en']['createEdgeError']);
          } else {
            // create a node the temporary line can look at
            var targetNode = this._getNewTargetNode(node.x, node.y);
            this.body.nodes[targetNode.id] = targetNode;
            this.body.nodeIndices.push(targetNode.id);

            // create a temporary edge
            var connectionEdge = this.body.functions.createEdge({
              id: 'connectionEdge' + util.randomUUID(),
              from: node.id,
              to: targetNode.id,
              physics: false,
              smooth: {
                enabled: true,
                type: 'continuous',
                roundness: 0.5
              }
            });
            this.body.edges[connectionEdge.id] = connectionEdge;
            this.body.edgeIndices.push(connectionEdge.id);

            this.temporaryIds.nodes.push(targetNode.id);
            this.temporaryIds.edges.push(connectionEdge.id);
          }
        }
        this.touchTime = new Date().valueOf();
      }
    }
  }, {
    key: '_dragControlNode',
    value: function _dragControlNode(event) {
      var pointer = this.body.functions.getPointer(event.center);
      if (this.temporaryIds.nodes[0] !== undefined) {
        var targetNode = this.body.nodes[this.temporaryIds.nodes[0]]; // there is only one temp node in the add edge mode.
        targetNode.x = this.canvas._XconvertDOMtoCanvas(pointer.x);
        targetNode.y = this.canvas._YconvertDOMtoCanvas(pointer.y);
        this.body.emitter.emit('_redraw');
      } else {
        var diffX = pointer.x - this.lastTouch.x;
        var diffY = pointer.y - this.lastTouch.y;
        this.body.view.translation = { x: this.lastTouch.translation.x + diffX, y: this.lastTouch.translation.y + diffY };
      }
    }

    /**
     * Connect the new edge to the target if one exists, otherwise remove temp line
     * @param event
     * @private
     */
  }, {
    key: '_finishConnect',
    value: function _finishConnect(event) {
      var pointer = this.body.functions.getPointer(event.center);
      var pointerObj = this.selectionHandler._pointerToPositionObject(pointer);

      // remember the edge id
      var connectFromId = undefined;
      if (this.temporaryIds.edges[0] !== undefined) {
        connectFromId = this.body.edges[this.temporaryIds.edges[0]].fromId;
      }

      // get the overlapping node but NOT the temporary node;
      var overlappingNodeIds = this.selectionHandler._getAllNodesOverlappingWith(pointerObj);
      var node = undefined;
      for (var i = overlappingNodeIds.length - 1; i >= 0; i--) {
        // if the node id is NOT a temporary node, accept the node.
        if (this.temporaryIds.nodes.indexOf(overlappingNodeIds[i]) === -1) {
          node = this.body.nodes[overlappingNodeIds[i]];
          break;
        }
      }

      // clean temporary nodes and edges.
      this._cleanupTemporaryNodesAndEdges();

      // perform the connection
      if (node !== undefined) {
        if (node.isCluster === true) {
          alert(this.options.locales[this.options.locale]['createEdgeError'] || this.options.locales['en']['createEdgeError']);
        } else {
          if (this.body.nodes[connectFromId] !== undefined && this.body.nodes[node.id] !== undefined) {
            this._performAddEdge(connectFromId, node.id);
          }
        }
      }
      this.body.emitter.emit('_redraw');
    }

    // --------------------------------------- END OF ADD EDGE FUNCTIONS -------------------------------------//

    // ------------------------------ Performing all the actual data manipulation ------------------------//

    /**
     * Adds a node on the specified location
     */
  }, {
    key: '_performAddNode',
    value: function _performAddNode(clickData) {
      var _this5 = this;

      var defaultData = {
        id: util.randomUUID(),
        x: clickData.pointer.canvas.x,
        y: clickData.pointer.canvas.y,
        label: 'new'
      };

      if (typeof this.options.addNode === 'function') {
        if (this.options.addNode.length === 2) {
          this.options.addNode(defaultData, function (finalizedData) {
            if (finalizedData !== null && finalizedData !== undefined && _this5.inMode === 'addNode') {
              // if for whatever reason the mode has changes (due to dataset change) disregard the callback
              _this5.body.data.nodes.getDataSet().add(finalizedData);
              _this5.showManipulatorToolbar();
            }
          });
        } else {
          throw new Error('The function for add does not support two arguments (data,callback)');
          this.showManipulatorToolbar();
        }
      } else {
        this.body.data.nodes.getDataSet().add(defaultData);
        this.showManipulatorToolbar();
      }
    }

    /**
     * connect two nodes with a new edge.
     *
     * @private
     */
  }, {
    key: '_performAddEdge',
    value: function _performAddEdge(sourceNodeId, targetNodeId) {
      var _this6 = this;

      var defaultData = { from: sourceNodeId, to: targetNodeId };
      if (typeof this.options.addEdge === 'function') {
        if (this.options.addEdge.length === 2) {
          this.options.addEdge(defaultData, function (finalizedData) {
            if (finalizedData !== null && finalizedData !== undefined && _this6.inMode === 'addEdge') {
              // if for whatever reason the mode has changes (due to dataset change) disregard the callback
              _this6.body.data.edges.getDataSet().add(finalizedData);
              _this6.selectionHandler.unselectAll();
              _this6.showManipulatorToolbar();
            }
          });
        } else {
          throw new Error('The function for connect does not support two arguments (data,callback)');
        }
      } else {
        this.body.data.edges.getDataSet().add(defaultData);
        this.selectionHandler.unselectAll();
        this.showManipulatorToolbar();
      }
    }

    /**
     * connect two nodes with a new edge.
     *
     * @private
     */
  }, {
    key: '_performEditEdge',
    value: function _performEditEdge(sourceNodeId, targetNodeId) {
      var _this7 = this;

      var defaultData = { id: this.edgeBeingEditedId, from: sourceNodeId, to: targetNodeId };
      if (typeof this.options.editEdge === 'function') {
        if (this.options.editEdge.length === 2) {
          this.options.editEdge(defaultData, function (finalizedData) {
            if (finalizedData === null || finalizedData === undefined || _this7.inMode !== 'editEdge') {
              // if for whatever reason the mode has changes (due to dataset change) disregard the callback) {
              _this7.body.edges[defaultData.id].updateEdgeType();
              _this7.body.emitter.emit('_redraw');
            } else {
              _this7.body.data.edges.getDataSet().update(finalizedData);
              _this7.selectionHandler.unselectAll();
              _this7.showManipulatorToolbar();
            }
          });
        } else {
          throw new Error('The function for edit does not support two arguments (data, callback)');
        }
      } else {
        this.body.data.edges.getDataSet().update(defaultData);
        this.selectionHandler.unselectAll();
        this.showManipulatorToolbar();
      }
    }
  }]);

  return ManipulationSystem;
})();

exports['default'] = ManipulationSystem;
module.exports = exports['default'];

},{"../../hammerUtil":5,"../../module/hammer":6,"../../util":73}],24:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _componentsNode = require("./components/Node");

var _componentsNode2 = _interopRequireDefault(_componentsNode);

var _componentsSharedLabel = require("./components/shared/Label");

var _componentsSharedLabel2 = _interopRequireDefault(_componentsSharedLabel);

var util = require("../../util");
var DataSet = require('../../DataSet');
var DataView = require('../../DataView');

var NodesHandler = (function () {
  function NodesHandler(body, images, groups, layoutEngine) {
    var _this = this;

    _classCallCheck(this, NodesHandler);

    this.body = body;
    this.images = images;
    this.groups = groups;
    this.layoutEngine = layoutEngine;

    // create the node API in the body container
    this.body.functions.createNode = this.create.bind(this);

    this.nodesListeners = {
      add: function add(event, params) {
        _this.add(params.items);
      },
      update: function update(event, params) {
        _this.update(params.items, params.data);
      },
      remove: function remove(event, params) {
        _this.remove(params.items);
      }
    };

    this.options = {};
    this.defaultOptions = {
      borderWidth: 1,
      borderWidthSelected: 2,
      brokenImage: undefined,
      color: {
        border: '#2B7CE9',
        background: '#97C2FC',
        highlight: {
          border: '#2B7CE9',
          background: '#D2E5FF'
        },
        hover: {
          border: '#2B7CE9',
          background: '#D2E5FF'
        }
      },
      fixed: {
        x: false,
        y: false
      },
      font: {
        color: '#343434',
        size: 14, // px
        face: 'arial',
        background: 'none',
        strokeWidth: 0, // px
        strokeColor: '#ffffff',
        align: 'horizontal'
      },
      group: undefined,
      hidden: false,
      icon: {
        face: 'FontAwesome', //'FontAwesome',
        code: undefined, //'\uf007',
        size: 50, //50,
        color: '#2B7CE9' //'#aa00ff'
      },
      image: undefined, // --> URL
      label: undefined,
      labelHighlightBold: true,
      level: undefined,
      mass: 1,
      physics: true,
      scaling: {
        min: 10,
        max: 30,
        label: {
          enabled: false,
          min: 14,
          max: 30,
          maxVisible: 30,
          drawThreshold: 5
        },
        customScalingFunction: function customScalingFunction(min, max, total, value) {
          if (max === min) {
            return 0.5;
          } else {
            var scale = 1 / (max - min);
            return Math.max(0, (value - min) * scale);
          }
        }
      },
      shadow: {
        enabled: false,
        size: 10,
        x: 5,
        y: 5
      },
      shape: 'ellipse',
      shapeProperties: {
        borderDashes: false, // only for borders
        borderRadius: 6, // only for box shape
        useImageSize: false, // only for image and circularImage shapes
        useBorderWithImage: false // only for image shape
      },
      size: 25,
      title: undefined,
      value: undefined,
      x: undefined,
      y: undefined
    };
    util.extend(this.options, this.defaultOptions);

    this.bindEventListeners();
  }

  _createClass(NodesHandler, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this2 = this;

      // refresh the nodes. Used when reverting from hierarchical layout
      this.body.emitter.on('refreshNodes', this.refresh.bind(this));
      this.body.emitter.on('refresh', this.refresh.bind(this));
      this.body.emitter.on('destroy', function () {
        delete _this2.body.functions.createNode;
        delete _this2.nodesListeners.add;
        delete _this2.nodesListeners.update;
        delete _this2.nodesListeners.remove;
        delete _this2.nodesListeners;
      });
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        _componentsNode2['default'].parseOptions(this.options, options);

        // update the shape in all nodes
        if (options.shape !== undefined) {
          for (var nodeId in this.body.nodes) {
            if (this.body.nodes.hasOwnProperty(nodeId)) {
              this.body.nodes[nodeId].updateShape();
            }
          }
        }

        // update the font in all nodes
        if (options.font !== undefined) {
          _componentsSharedLabel2['default'].parseOptions(this.options.font, options);
          for (var nodeId in this.body.nodes) {
            if (this.body.nodes.hasOwnProperty(nodeId)) {
              this.body.nodes[nodeId].updateLabelModule();
              this.body.nodes[nodeId]._reset();
            }
          }
        }

        // update the shape size in all nodes
        if (options.size !== undefined) {
          for (var nodeId in this.body.nodes) {
            if (this.body.nodes.hasOwnProperty(nodeId)) {
              this.body.nodes[nodeId]._reset();
            }
          }
        }

        // update the state of the letiables if needed
        if (options.hidden !== undefined || options.physics !== undefined) {
          this.body.emitter.emit('_dataChanged');
        }
      }
    }

    /**
     * Set a data set with nodes for the network
     * @param {Array | DataSet | DataView} nodes         The data containing the nodes.
     * @private
     */
  }, {
    key: 'setData',
    value: function setData(nodes) {
      var _this3 = this;

      var doNotEmit = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var oldNodesData = this.body.data.nodes;

      if (nodes instanceof DataSet || nodes instanceof DataView) {
        this.body.data.nodes = nodes;
      } else if (Array.isArray(nodes)) {
        this.body.data.nodes = new DataSet();
        this.body.data.nodes.add(nodes);
      } else if (!nodes) {
        this.body.data.nodes = new DataSet();
      } else {
        throw new TypeError('Array or DataSet expected');
      }

      if (oldNodesData) {
        // unsubscribe from old dataset
        util.forEach(this.nodesListeners, function (callback, event) {
          oldNodesData.off(event, callback);
        });
      }

      // remove drawn nodes
      this.body.nodes = {};

      if (this.body.data.nodes) {
        (function () {
          // subscribe to new dataset
          var me = _this3;
          util.forEach(_this3.nodesListeners, function (callback, event) {
            me.body.data.nodes.on(event, callback);
          });

          // draw all new nodes
          var ids = _this3.body.data.nodes.getIds();
          _this3.add(ids, true);
        })();
      }

      if (doNotEmit === false) {
        this.body.emitter.emit("_dataChanged");
      }
    }

    /**
     * Add nodes
     * @param {Number[] | String[]} ids
     * @private
     */
  }, {
    key: 'add',
    value: function add(ids) {
      var doNotEmit = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var id = undefined;
      var newNodes = [];
      for (var i = 0; i < ids.length; i++) {
        id = ids[i];
        var properties = this.body.data.nodes.get(id);
        var node = this.create(properties);
        newNodes.push(node);
        this.body.nodes[id] = node; // note: this may replace an existing node
      }

      this.layoutEngine.positionInitially(newNodes);

      if (doNotEmit === false) {
        this.body.emitter.emit("_dataChanged");
      }
    }

    /**
     * Update existing nodes, or create them when not yet existing
     * @param {Number[] | String[]} ids
     * @private
     */
  }, {
    key: 'update',
    value: function update(ids, changedData) {
      var nodes = this.body.nodes;
      var dataChanged = false;
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var node = nodes[id];
        var data = changedData[i];
        if (node !== undefined) {
          // update node
          dataChanged = node.setOptions(data);
        } else {
          dataChanged = true;
          // create node
          node = this.create(data);
          nodes[id] = node;
        }
      }
      if (dataChanged === true) {
        this.body.emitter.emit("_dataChanged");
      } else {
        this.body.emitter.emit("_dataUpdated");
      }
    }

    /**
     * Remove existing nodes. If nodes do not exist, the method will just ignore it.
     * @param {Number[] | String[]} ids
     * @private
     */
  }, {
    key: 'remove',
    value: function remove(ids) {
      var nodes = this.body.nodes;

      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        delete nodes[id];
      }

      this.body.emitter.emit("_dataChanged");
    }

    /**
     * create a node
     * @param properties
     * @param constructorClass
     */
  }, {
    key: 'create',
    value: function create(properties) {
      var constructorClass = arguments.length <= 1 || arguments[1] === undefined ? _componentsNode2['default'] : arguments[1];

      return new constructorClass(properties, this.body, this.images, this.groups, this.options);
    }
  }, {
    key: 'refresh',
    value: function refresh() {
      var clearPositions = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

      var nodes = this.body.nodes;
      for (var nodeId in nodes) {
        var node = undefined;
        if (nodes.hasOwnProperty(nodeId)) {
          node = nodes[nodeId];
        }
        var data = this.body.data.nodes._data[nodeId];
        if (node !== undefined && data !== undefined) {
          if (clearPositions === true) {
            node.setOptions({ x: null, y: null });
          }
          node.setOptions({ fixed: false });
          node.setOptions(data);
        }
      }
    }

    /**
     * Returns the positions of the nodes.
     * @param ids  --> optional, can be array of nodeIds, can be string
     * @returns {{}}
     */
  }, {
    key: 'getPositions',
    value: function getPositions(ids) {
      var dataArray = {};
      if (ids !== undefined) {
        if (Array.isArray(ids) === true) {
          for (var i = 0; i < ids.length; i++) {
            if (this.body.nodes[ids[i]] !== undefined) {
              var node = this.body.nodes[ids[i]];
              dataArray[ids[i]] = { x: Math.round(node.x), y: Math.round(node.y) };
            }
          }
        } else {
          if (this.body.nodes[ids] !== undefined) {
            var node = this.body.nodes[ids];
            dataArray[ids] = { x: Math.round(node.x), y: Math.round(node.y) };
          }
        }
      } else {
        for (var i = 0; i < this.body.nodeIndices.length; i++) {
          var node = this.body.nodes[this.body.nodeIndices[i]];
          dataArray[this.body.nodeIndices[i]] = { x: Math.round(node.x), y: Math.round(node.y) };
        }
      }
      return dataArray;
    }

    /**
     * Load the XY positions of the nodes into the dataset.
     */
  }, {
    key: 'storePositions',
    value: function storePositions() {
      // todo: add support for clusters and hierarchical.
      var dataArray = [];
      var dataset = this.body.data.nodes.getDataSet();

      for (var nodeId in dataset._data) {
        if (dataset._data.hasOwnProperty(nodeId)) {
          var node = this.body.nodes[nodeId];
          if (dataset._data[nodeId].x != Math.round(node.x) || dataset._data[nodeId].y != Math.round(node.y)) {
            dataArray.push({ id: nodeId, x: Math.round(node.x), y: Math.round(node.y) });
          }
        }
      }
      dataset.update(dataArray);
    }

    /**
     * get the bounding box of a node.
     * @param nodeId
     * @returns {j|*}
     */
  }, {
    key: 'getBoundingBox',
    value: function getBoundingBox(nodeId) {
      if (this.body.nodes[nodeId] !== undefined) {
        return this.body.nodes[nodeId].shape.boundingBox;
      }
    }

    /**
     * Get the Ids of nodes connected to this node.
     * @param nodeId
     * @returns {Array}
     */
  }, {
    key: 'getConnectedNodes',
    value: function getConnectedNodes(nodeId) {
      var nodeList = [];
      if (this.body.nodes[nodeId] !== undefined) {
        var node = this.body.nodes[nodeId];
        var nodeObj = {}; // used to quickly check if node already exists
        for (var i = 0; i < node.edges.length; i++) {
          var edge = node.edges[i];
          if (edge.toId == nodeId) {
            // these are double equals since ids can be numeric or string
            if (nodeObj[edge.fromId] === undefined) {
              nodeList.push(edge.fromId);
              nodeObj[edge.fromId] = true;
            }
          } else if (edge.fromId == nodeId) {
            // these are double equals since ids can be numeric or string
            if (nodeObj[edge.toId] === undefined) {
              nodeList.push(edge.toId);
              nodeObj[edge.toId] = true;
            }
          }
        }
      }
      return nodeList;
    }

    /**
     * Get the ids of the edges connected to this node.
     * @param nodeId
     * @returns {*}
     */
  }, {
    key: 'getConnectedEdges',
    value: function getConnectedEdges(nodeId) {
      var edgeList = [];
      if (this.body.nodes[nodeId] !== undefined) {
        var node = this.body.nodes[nodeId];
        for (var i = 0; i < node.edges.length; i++) {
          edgeList.push(node.edges[i].id);
        }
      } else {
        console.log("NodeId provided for getConnectedEdges does not exist. Provided: ", nodeId);
      }
      return edgeList;
    }

    /**
     * Move a node.
     * @param String nodeId
     * @param Number x
     * @param Number y
     */
  }, {
    key: 'moveNode',
    value: function moveNode(nodeId, x, y) {
      var _this4 = this;

      if (this.body.nodes[nodeId] !== undefined) {
        this.body.nodes[nodeId].x = Number(x);
        this.body.nodes[nodeId].y = Number(y);
        setTimeout(function () {
          _this4.body.emitter.emit("startSimulation");
        }, 0);
      } else {
        console.log("Node id supplied to moveNode does not exist. Provided: ", nodeId);
      }
    }
  }]);

  return NodesHandler;
})();

exports['default'] = NodesHandler;
module.exports = exports['default'];

},{"../../DataSet":2,"../../DataView":3,"../../util":73,"./components/Node":30,"./components/shared/Label":66}],25:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _componentsPhysicsBarnesHutSolver = require('./components/physics/BarnesHutSolver');

var _componentsPhysicsBarnesHutSolver2 = _interopRequireDefault(_componentsPhysicsBarnesHutSolver);

var _componentsPhysicsRepulsionSolver = require('./components/physics/RepulsionSolver');

var _componentsPhysicsRepulsionSolver2 = _interopRequireDefault(_componentsPhysicsRepulsionSolver);

var _componentsPhysicsHierarchicalRepulsionSolver = require('./components/physics/HierarchicalRepulsionSolver');

var _componentsPhysicsHierarchicalRepulsionSolver2 = _interopRequireDefault(_componentsPhysicsHierarchicalRepulsionSolver);

var _componentsPhysicsSpringSolver = require('./components/physics/SpringSolver');

var _componentsPhysicsSpringSolver2 = _interopRequireDefault(_componentsPhysicsSpringSolver);

var _componentsPhysicsHierarchicalSpringSolver = require('./components/physics/HierarchicalSpringSolver');

var _componentsPhysicsHierarchicalSpringSolver2 = _interopRequireDefault(_componentsPhysicsHierarchicalSpringSolver);

var _componentsPhysicsCentralGravitySolver = require('./components/physics/CentralGravitySolver');

var _componentsPhysicsCentralGravitySolver2 = _interopRequireDefault(_componentsPhysicsCentralGravitySolver);

var _componentsPhysicsFA2BasedRepulsionSolver = require('./components/physics/FA2BasedRepulsionSolver');

var _componentsPhysicsFA2BasedRepulsionSolver2 = _interopRequireDefault(_componentsPhysicsFA2BasedRepulsionSolver);

var _componentsPhysicsFA2BasedCentralGravitySolver = require('./components/physics/FA2BasedCentralGravitySolver');

var _componentsPhysicsFA2BasedCentralGravitySolver2 = _interopRequireDefault(_componentsPhysicsFA2BasedCentralGravitySolver);

var util = require('../../util');

var PhysicsEngine = (function () {
  function PhysicsEngine(body) {
    _classCallCheck(this, PhysicsEngine);

    this.body = body;
    this.physicsBody = { physicsNodeIndices: [], physicsEdgeIndices: [], forces: {}, velocities: {} };

    this.physicsEnabled = true;
    this.simulationInterval = 1000 / 60;
    this.requiresTimeout = true;
    this.previousStates = {};
    this.referenceState = {};
    this.freezeCache = {};
    this.renderTimer = undefined;

    // parameters for the adaptive timestep
    this.adaptiveTimestep = false;
    this.adaptiveTimestepEnabled = false;
    this.adaptiveCounter = 0;
    this.adaptiveInterval = 3;

    this.stabilized = false;
    this.startedStabilization = false;
    this.stabilizationIterations = 0;
    this.ready = false; // will be set to true if the stabilize

    // default options
    this.options = {};
    this.defaultOptions = {
      enabled: true,
      barnesHut: {
        theta: 0.5,
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 95,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0
      },
      forceAtlas2Based: {
        theta: 0.5,
        gravitationalConstant: -50,
        centralGravity: 0.01,
        springConstant: 0.08,
        springLength: 100,
        damping: 0.4,
        avoidOverlap: 0
      },
      repulsion: {
        centralGravity: 0.2,
        springLength: 200,
        springConstant: 0.05,
        nodeDistance: 100,
        damping: 0.09,
        avoidOverlap: 0
      },
      hierarchicalRepulsion: {
        centralGravity: 0.0,
        springLength: 100,
        springConstant: 0.01,
        nodeDistance: 120,
        damping: 0.09
      },
      maxVelocity: 50,
      minVelocity: 0.75, // px/s
      solver: 'barnesHut',
      stabilization: {
        enabled: true,
        iterations: 1000, // maximum number of iteration to stabilize
        updateInterval: 50,
        onlyDynamicEdges: false,
        fit: true
      },
      timestep: 0.5,
      adaptiveTimestep: true
    };
    util.extend(this.options, this.defaultOptions);
    this.timestep = 0.5;
    this.layoutFailed = false;

    this.bindEventListeners();
  }

  _createClass(PhysicsEngine, [{
    key: 'bindEventListeners',
    value: function bindEventListeners() {
      var _this = this;

      this.body.emitter.on('initPhysics', function () {
        _this.initPhysics();
      });
      this.body.emitter.on('_layoutFailed', function () {
        _this.layoutFailed = true;
      });
      this.body.emitter.on('resetPhysics', function () {
        _this.stopSimulation();_this.ready = false;
      });
      this.body.emitter.on('disablePhysics', function () {
        _this.physicsEnabled = false;_this.stopSimulation();
      });
      this.body.emitter.on('restorePhysics', function () {
        _this.setOptions(_this.options);
        if (_this.ready === true) {
          _this.startSimulation();
        }
      });
      this.body.emitter.on('startSimulation', function () {
        if (_this.ready === true) {
          _this.startSimulation();
        }
      });
      this.body.emitter.on('stopSimulation', function () {
        _this.stopSimulation();
      });
      this.body.emitter.on('destroy', function () {
        _this.stopSimulation(false);
        _this.body.emitter.off();
      });
      // this event will trigger a rebuilding of the cache everything. Used when nodes or edges have been added or removed.
      this.body.emitter.on("_dataChanged", function () {
        // update shortcut lists
        _this.updatePhysicsData();
      });

      // debug: show forces
      // this.body.emitter.on("afterDrawing", (ctx) => {this._drawForces(ctx);});
    }

    /**
     * set the physics options
     * @param options
     */
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        if (options === false) {
          this.options.enabled = false;
          this.physicsEnabled = false;
          this.stopSimulation();
        } else {
          this.physicsEnabled = true;
          util.selectiveNotDeepExtend(['stabilization'], this.options, options);
          util.mergeOptions(this.options, options, 'stabilization');

          if (options.enabled === undefined) {
            this.options.enabled = true;
          }

          if (this.options.enabled === false) {
            this.physicsEnabled = false;
            this.stopSimulation();
          }

          // set the timestep
          this.timestep = this.options.timestep;
        }
      }
      this.init();
    }

    /**
     * configure the engine.
     */
  }, {
    key: 'init',
    value: function init() {
      var options;
      if (this.options.solver === 'forceAtlas2Based') {
        options = this.options.forceAtlas2Based;
        this.nodesSolver = new _componentsPhysicsFA2BasedRepulsionSolver2['default'](this.body, this.physicsBody, options);
        this.edgesSolver = new _componentsPhysicsSpringSolver2['default'](this.body, this.physicsBody, options);
        this.gravitySolver = new _componentsPhysicsFA2BasedCentralGravitySolver2['default'](this.body, this.physicsBody, options);
      } else if (this.options.solver === 'repulsion') {
        options = this.options.repulsion;
        this.nodesSolver = new _componentsPhysicsRepulsionSolver2['default'](this.body, this.physicsBody, options);
        this.edgesSolver = new _componentsPhysicsSpringSolver2['default'](this.body, this.physicsBody, options);
        this.gravitySolver = new _componentsPhysicsCentralGravitySolver2['default'](this.body, this.physicsBody, options);
      } else if (this.options.solver === 'hierarchicalRepulsion') {
        options = this.options.hierarchicalRepulsion;
        this.nodesSolver = new _componentsPhysicsHierarchicalRepulsionSolver2['default'](this.body, this.physicsBody, options);
        this.edgesSolver = new _componentsPhysicsHierarchicalSpringSolver2['default'](this.body, this.physicsBody, options);
        this.gravitySolver = new _componentsPhysicsCentralGravitySolver2['default'](this.body, this.physicsBody, options);
      } else {
        // barnesHut
        options = this.options.barnesHut;
        this.nodesSolver = new _componentsPhysicsBarnesHutSolver2['default'](this.body, this.physicsBody, options);
        this.edgesSolver = new _componentsPhysicsSpringSolver2['default'](this.body, this.physicsBody, options);
        this.gravitySolver = new _componentsPhysicsCentralGravitySolver2['default'](this.body, this.physicsBody, options);
      }

      this.modelOptions = options;
    }

    /**
     * initialize the engine
     */
  }, {
    key: 'initPhysics',
    value: function initPhysics() {
      if (this.physicsEnabled === true && this.options.enabled === true) {
        if (this.options.stabilization.enabled === true) {
          this.stabilize();
        } else {
          this.stabilized = false;
          this.ready = true;
          this.body.emitter.emit('fit', {}, this.layoutFailed); // if the layout failed, we use the approximation for the zoom
          this.startSimulation();
        }
      } else {
        this.ready = true;
        this.body.emitter.emit('fit');
      }
    }

    /**
     * Start the simulation
     */
  }, {
    key: 'startSimulation',
    value: function startSimulation() {
      if (this.physicsEnabled === true && this.options.enabled === true) {
        this.stabilized = false;

        // when visible, adaptivity is disabled.
        this.adaptiveTimestep = false;

        // this sets the width of all nodes initially which could be required for the avoidOverlap
        this.body.emitter.emit("_resizeNodes");
        if (this.viewFunction === undefined) {
          this.viewFunction = this.simulationStep.bind(this);
          this.body.emitter.on('initRedraw', this.viewFunction);
          this.body.emitter.emit('_startRendering');
        }
      } else {
        this.body.emitter.emit('_redraw');
      }
    }

    /**
     * Stop the simulation, force stabilization.
     */
  }, {
    key: 'stopSimulation',
    value: function stopSimulation() {
      var emit = arguments.length <= 0 || arguments[0] === undefined ? true : arguments[0];

      this.stabilized = true;
      if (emit === true) {
        this._emitStabilized();
      }
      if (this.viewFunction !== undefined) {
        this.body.emitter.off('initRedraw', this.viewFunction);
        this.viewFunction = undefined;
        if (emit === true) {
          this.body.emitter.emit('_stopRendering');
        }
      }
    }

    /**
     * The viewFunction inserts this step into each renderloop. It calls the physics tick and handles the cleanup at stabilized.
     *
     */
  }, {
    key: 'simulationStep',
    value: function simulationStep() {
      // check if the physics have settled
      var startTime = Date.now();
      this.physicsTick();
      var physicsTime = Date.now() - startTime;

      // run double speed if it is a little graph
      if ((physicsTime < 0.4 * this.simulationInterval || this.runDoubleSpeed === true) && this.stabilized === false) {
        this.physicsTick();

        // this makes sure there is no jitter. The decision is taken once to run it at double speed.
        this.runDoubleSpeed = true;
      }

      if (this.stabilized === true) {
        this.stopSimulation();
      }
    }

    /**
     * trigger the stabilized event.
     * @private
     */
  }, {
    key: '_emitStabilized',
    value: function _emitStabilized() {
      var _this2 = this;

      var amountOfIterations = arguments.length <= 0 || arguments[0] === undefined ? this.stabilizationIterations : arguments[0];

      if (this.stabilizationIterations > 1 || this.startedStabilization === true) {
        setTimeout(function () {
          _this2.body.emitter.emit('stabilized', { iterations: amountOfIterations });
          _this2.startedStabilization = false;
          _this2.stabilizationIterations = 0;
        }, 0);
      }
    }

    /**
     * A single simulation step (or 'tick') in the physics simulation
     *
     * @private
     */
  }, {
    key: 'physicsTick',
    value: function physicsTick() {
      // this is here to ensure that there is no start event when the network is already stable.
      if (this.startedStabilization === false) {
        this.body.emitter.emit('startStabilizing');
        this.startedStabilization = true;
      }

      if (this.stabilized === false) {
        // adaptivity means the timestep adapts to the situation, only applicable for stabilization
        if (this.adaptiveTimestep === true && this.adaptiveTimestepEnabled === true) {
          // this is the factor for increasing the timestep on success.
          var factor = 1.2;

          // we assume the adaptive interval is
          if (this.adaptiveCounter % this.adaptiveInterval === 0) {
            // we leave the timestep stable for "interval" iterations.
            // first the big step and revert. Revert saves the reference state.
            this.timestep = 2 * this.timestep;
            this.calculateForces();
            this.moveNodes();
            this.revert();

            // now the normal step. Since this is the last step, it is the more stable one and we will take this.
            this.timestep = 0.5 * this.timestep;

            // since it's half the step, we do it twice.
            this.calculateForces();
            this.moveNodes();
            this.calculateForces();
            this.moveNodes();

            // we compare the two steps. if it is acceptable we double the step.
            if (this._evaluateStepQuality() === true) {
              this.timestep = factor * this.timestep;
            } else {
              // if not, we decrease the step to a minimum of the options timestep.
              // if the decreased timestep is smaller than the options step, we do not reset the counter
              // we assume that the options timestep is stable enough.
              if (this.timestep / factor < this.options.timestep) {
                this.timestep = this.options.timestep;
              } else {
                // if the timestep was larger than 2 times the option one we check the adaptivity again to ensure
                // that large instabilities do not form.
                this.adaptiveCounter = -1; // check again next iteration
                this.timestep = Math.max(this.options.timestep, this.timestep / factor);
              }
            }
          } else {
            // normal step, keeping timestep constant
            this.calculateForces();
            this.moveNodes();
          }

          // increment the counter
          this.adaptiveCounter += 1;
        } else {
          // case for the static timestep, we reset it to the one in options and take a normal step.
          this.timestep = this.options.timestep;
          this.calculateForces();
          this.moveNodes();
        }

        // determine if the network has stabilzied
        if (this.stabilized === true) {
          this.revert();
        }

        this.stabilizationIterations++;
      }
    }

    /**
     * Nodes and edges can have the physics toggles on or off. A collection of indices is created here so we can skip the check all the time.
     *
     * @private
     */
  }, {
    key: 'updatePhysicsData',
    value: function updatePhysicsData() {
      this.physicsBody.forces = {};
      this.physicsBody.physicsNodeIndices = [];
      this.physicsBody.physicsEdgeIndices = [];
      var nodes = this.body.nodes;
      var edges = this.body.edges;

      // get node indices for physics
      for (var nodeId in nodes) {
        if (nodes.hasOwnProperty(nodeId)) {
          if (nodes[nodeId].options.physics === true) {
            this.physicsBody.physicsNodeIndices.push(nodeId);
          }
        }
      }

      // get edge indices for physics
      for (var edgeId in edges) {
        if (edges.hasOwnProperty(edgeId)) {
          if (edges[edgeId].options.physics === true) {
            this.physicsBody.physicsEdgeIndices.push(edgeId);
          }
        }
      }

      // get the velocity and the forces vector
      for (var i = 0; i < this.physicsBody.physicsNodeIndices.length; i++) {
        var nodeId = this.physicsBody.physicsNodeIndices[i];
        this.physicsBody.forces[nodeId] = { x: 0, y: 0 };

        // forces can be reset because they are recalculated. Velocities have to persist.
        if (this.physicsBody.velocities[nodeId] === undefined) {
          this.physicsBody.velocities[nodeId] = { x: 0, y: 0 };
        }
      }

      // clean deleted nodes from the velocity vector
      for (var nodeId in this.physicsBody.velocities) {
        if (nodes[nodeId] === undefined) {
          delete this.physicsBody.velocities[nodeId];
        }
      }
    }

    /**
     * Revert the simulation one step. This is done so after stabilization, every new start of the simulation will also say stabilized.
     */
  }, {
    key: 'revert',
    value: function revert() {
      var nodeIds = Object.keys(this.previousStates);
      var nodes = this.body.nodes;
      var velocities = this.physicsBody.velocities;
      this.referenceState = {};

      for (var i = 0; i < nodeIds.length; i++) {
        var nodeId = nodeIds[i];
        if (nodes[nodeId] !== undefined) {
          if (nodes[nodeId].options.physics === true) {
            this.referenceState[nodeId] = {
              positions: { x: nodes[nodeId].x, y: nodes[nodeId].y }
            };
            velocities[nodeId].x = this.previousStates[nodeId].vx;
            velocities[nodeId].y = this.previousStates[nodeId].vy;
            nodes[nodeId].x = this.previousStates[nodeId].x;
            nodes[nodeId].y = this.previousStates[nodeId].y;
          }
        } else {
          delete this.previousStates[nodeId];
        }
      }
    }

    /**
     * This compares the reference state to the current state
     */
  }, {
    key: '_evaluateStepQuality',
    value: function _evaluateStepQuality() {
      var dx = undefined,
          dy = undefined,
          dpos = undefined;
      var nodes = this.body.nodes;
      var reference = this.referenceState;
      var posThreshold = 0.3;

      for (var nodeId in this.referenceState) {
        if (this.referenceState.hasOwnProperty(nodeId) && nodes[nodeId] !== undefined) {
          dx = nodes[nodeId].x - reference[nodeId].positions.x;
          dy = nodes[nodeId].y - reference[nodeId].positions.y;

          dpos = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));

          if (dpos > posThreshold) {
            return false;
          }
        }
      }
      return true;
    }

    /**
     * move the nodes one timestap and check if they are stabilized
     * @returns {boolean}
     */
  }, {
    key: 'moveNodes',
    value: function moveNodes() {
      var nodeIndices = this.physicsBody.physicsNodeIndices;
      var maxVelocity = this.options.maxVelocity ? this.options.maxVelocity : 1e9;
      var maxNodeVelocity = 0;
      var averageNodeVelocity = 0;

      // the velocity threshold (energy in the system) for the adaptivity toggle
      var velocityAdaptiveThreshold = 5;

      for (var i = 0; i < nodeIndices.length; i++) {
        var nodeId = nodeIndices[i];
        var nodeVelocity = this._performStep(nodeId, maxVelocity);
        // stabilized is true if stabilized is true and velocity is smaller than vmin --> all nodes must be stabilized
        maxNodeVelocity = Math.max(maxNodeVelocity, nodeVelocity);
        averageNodeVelocity += nodeVelocity;
      }

      // evaluating the stabilized and adaptiveTimestepEnabled conditions
      this.adaptiveTimestepEnabled = averageNodeVelocity / nodeIndices.length < velocityAdaptiveThreshold;
      this.stabilized = maxNodeVelocity < this.options.minVelocity;
    }

    /**
     * Perform the actual step
     *
     * @param nodeId
     * @param maxVelocity
     * @returns {number}
     * @private
     */
  }, {
    key: '_performStep',
    value: function _performStep(nodeId, maxVelocity) {
      var node = this.body.nodes[nodeId];
      var timestep = this.timestep;
      var forces = this.physicsBody.forces;
      var velocities = this.physicsBody.velocities;

      // store the state so we can revert
      this.previousStates[nodeId] = { x: node.x, y: node.y, vx: velocities[nodeId].x, vy: velocities[nodeId].y };

      if (node.options.fixed.x === false) {
        var dx = this.modelOptions.damping * velocities[nodeId].x; // damping force
        var ax = (forces[nodeId].x - dx) / node.options.mass; // acceleration
        velocities[nodeId].x += ax * timestep; // velocity
        velocities[nodeId].x = Math.abs(velocities[nodeId].x) > maxVelocity ? velocities[nodeId].x > 0 ? maxVelocity : -maxVelocity : velocities[nodeId].x;
        node.x += velocities[nodeId].x * timestep; // position
      } else {
          forces[nodeId].x = 0;
          velocities[nodeId].x = 0;
        }

      if (node.options.fixed.y === false) {
        var dy = this.modelOptions.damping * velocities[nodeId].y; // damping force
        var ay = (forces[nodeId].y - dy) / node.options.mass; // acceleration
        velocities[nodeId].y += ay * timestep; // velocity
        velocities[nodeId].y = Math.abs(velocities[nodeId].y) > maxVelocity ? velocities[nodeId].y > 0 ? maxVelocity : -maxVelocity : velocities[nodeId].y;
        node.y += velocities[nodeId].y * timestep; // position
      } else {
          forces[nodeId].y = 0;
          velocities[nodeId].y = 0;
        }

      var totalVelocity = Math.sqrt(Math.pow(velocities[nodeId].x, 2) + Math.pow(velocities[nodeId].y, 2));
      return totalVelocity;
    }

    /**
     * calculate the forces for one physics iteration.
     */
  }, {
    key: 'calculateForces',
    value: function calculateForces() {
      this.gravitySolver.solve();
      this.nodesSolver.solve();
      this.edgesSolver.solve();
    }

    /**
     * When initializing and stabilizing, we can freeze nodes with a predefined position. This greatly speeds up stabilization
     * because only the supportnodes for the smoothCurves have to settle.
     *
     * @private
     */
  }, {
    key: '_freezeNodes',
    value: function _freezeNodes() {
      var nodes = this.body.nodes;
      for (var id in nodes) {
        if (nodes.hasOwnProperty(id)) {
          if (nodes[id].x && nodes[id].y) {
            this.freezeCache[id] = { x: nodes[id].options.fixed.x, y: nodes[id].options.fixed.y };
            nodes[id].options.fixed.x = true;
            nodes[id].options.fixed.y = true;
          }
        }
      }
    }

    /**
     * Unfreezes the nodes that have been frozen by _freezeDefinedNodes.
     *
     * @private
     */
  }, {
    key: '_restoreFrozenNodes',
    value: function _restoreFrozenNodes() {
      var nodes = this.body.nodes;
      for (var id in nodes) {
        if (nodes.hasOwnProperty(id)) {
          if (this.freezeCache[id] !== undefined) {
            nodes[id].options.fixed.x = this.freezeCache[id].x;
            nodes[id].options.fixed.y = this.freezeCache[id].y;
          }
        }
      }
      this.freezeCache = {};
    }

    /**
     * Find a stable position for all nodes
     */
  }, {
    key: 'stabilize',
    value: function stabilize() {
      var _this3 = this;

      var iterations = arguments.length <= 0 || arguments[0] === undefined ? this.options.stabilization.iterations : arguments[0];

      if (typeof iterations !== 'number') {
        console.log('The stabilize method needs a numeric amount of iterations. Switching to default: ', this.options.stabilization.iterations);
        iterations = this.options.stabilization.iterations;
      }

      if (this.physicsBody.physicsNodeIndices.length === 0) {
        this.ready = true;
        return;
      }

      // enable adaptive timesteps
      this.adaptiveTimestep = true && this.options.adaptiveTimestep;

      // this sets the width of all nodes initially which could be required for the avoidOverlap
      this.body.emitter.emit("_resizeNodes");

      // stop the render loop
      this.stopSimulation();

      // set stabilze to false
      this.stabilized = false;

      // block redraw requests
      this.body.emitter.emit('_blockRedraw');
      this.targetIterations = iterations;

      // start the stabilization
      if (this.options.stabilization.onlyDynamicEdges === true) {
        this._freezeNodes();
      }
      this.stabilizationIterations = 0;

      setTimeout(function () {
        return _this3._stabilizationBatch();
      }, 0);
    }

    /**
     * One batch of stabilization
     * @private
     */
  }, {
    key: '_stabilizationBatch',
    value: function _stabilizationBatch() {
      // this is here to ensure that there is at least one start event.
      if (this.startedStabilization === false) {
        this.body.emitter.emit('startStabilizing');
        this.startedStabilization = true;
      }

      var count = 0;
      while (this.stabilized === false && count < this.options.stabilization.updateInterval && this.stabilizationIterations < this.targetIterations) {
        this.physicsTick();
        count++;
      }

      if (this.stabilized === false && this.stabilizationIterations < this.targetIterations) {
        this.body.emitter.emit('stabilizationProgress', { iterations: this.stabilizationIterations, total: this.targetIterations });
        setTimeout(this._stabilizationBatch.bind(this), 0);
      } else {
        this._finalizeStabilization();
      }
    }

    /**
     * Wrap up the stabilization, fit and emit the events.
     * @private
     */
  }, {
    key: '_finalizeStabilization',
    value: function _finalizeStabilization() {
      this.body.emitter.emit('_allowRedraw');
      if (this.options.stabilization.fit === true) {
        this.body.emitter.emit('fit');
      }

      if (this.options.stabilization.onlyDynamicEdges === true) {
        this._restoreFrozenNodes();
      }

      this.body.emitter.emit('stabilizationIterationsDone');
      this.body.emitter.emit('_requestRedraw');

      if (this.stabilized === true) {
        this._emitStabilized();
      } else {
        // Prevent large complicated graphs from buzzing around after
        // stabilization.
        //this.startSimulation();
      }

      this.ready = true;
    }
  }, {
    key: '_drawForces',
    value: function _drawForces(ctx) {
      for (var i = 0; i < this.physicsBody.physicsNodeIndices.length; i++) {
        var node = this.body.nodes[this.physicsBody.physicsNodeIndices[i]];
        var force = this.physicsBody.forces[this.physicsBody.physicsNodeIndices[i]];
        var factor = 20;
        var colorFactor = 0.03;
        var forceSize = Math.sqrt(Math.pow(force.x, 2) + Math.pow(force.x, 2));

        var size = Math.min(Math.max(5, forceSize), 15);
        var arrowSize = 3 * size;

        var color = util.HSVToHex((180 - Math.min(1, Math.max(0, colorFactor * forceSize)) * 180) / 360, 1, 1);

        ctx.lineWidth = size;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(node.x + factor * force.x, node.y + factor * force.y);
        ctx.stroke();

        var angle = Math.atan2(force.y, force.x);
        ctx.fillStyle = color;
        ctx.arrow(node.x + factor * force.x + Math.cos(angle) * arrowSize, node.y + factor * force.y + Math.sin(angle) * arrowSize, angle, arrowSize);
        ctx.fill();
      }
    }
  }]);

  return PhysicsEngine;
})();

exports['default'] = PhysicsEngine;
module.exports = exports['default'];

},{"../../util":73,"./components/physics/BarnesHutSolver":58,"./components/physics/CentralGravitySolver":59,"./components/physics/FA2BasedCentralGravitySolver":60,"./components/physics/FA2BasedRepulsionSolver":61,"./components/physics/HierarchicalRepulsionSolver":62,"./components/physics/HierarchicalSpringSolver":63,"./components/physics/RepulsionSolver":64,"./components/physics/SpringSolver":65}],26:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Node = require("./components/Node");
var Edge = require("./components/Edge");
var util = require('../../util');

var SelectionHandler = (function () {
  function SelectionHandler(body, canvas) {
    var _this = this;

    _classCallCheck(this, SelectionHandler);

    this.body = body;
    this.canvas = canvas;
    this.selectionObj = { nodes: [], edges: [] };
    this.hoverObj = { nodes: {}, edges: {} };

    this.options = {};
    this.defaultOptions = {
      multiselect: false,
      selectable: true,
      selectConnectedEdges: true,
      hoverConnectedEdges: true
    };
    util.extend(this.options, this.defaultOptions);

    this.body.emitter.on("_dataChanged", function () {
      _this.updateSelection();
    });
  }

  _createClass(SelectionHandler, [{
    key: "setOptions",
    value: function setOptions(options) {
      if (options !== undefined) {
        var fields = ['multiselect', 'hoverConnectedEdges', 'selectable', 'selectConnectedEdges'];
        util.selectiveDeepExtend(fields, this.options, options);
      }
    }

    /**
     * handles the selection part of the tap;
     *
     * @param {Object} pointer
     * @private
     */
  }, {
    key: "selectOnPoint",
    value: function selectOnPoint(pointer) {
      var selected = false;
      if (this.options.selectable === true) {
        var obj = this.getNodeAt(pointer) || this.getEdgeAt(pointer);

        // unselect after getting the objects in order to restore width and height.
        this.unselectAll();

        if (obj !== undefined) {
          selected = this.selectObject(obj);
        }
        this.body.emitter.emit("_requestRedraw");
      }
      return selected;
    }
  }, {
    key: "selectAdditionalOnPoint",
    value: function selectAdditionalOnPoint(pointer) {
      var selectionChanged = false;
      if (this.options.selectable === true) {
        var obj = this.getNodeAt(pointer) || this.getEdgeAt(pointer);

        if (obj !== undefined) {
          selectionChanged = true;
          if (obj.isSelected() === true) {
            this.deselectObject(obj);
          } else {
            this.selectObject(obj);
          }

          this.body.emitter.emit("_requestRedraw");
        }
      }
      return selectionChanged;
    }
  }, {
    key: "_generateClickEvent",
    value: function _generateClickEvent(eventType, event, pointer, oldSelection) {
      var emptySelection = arguments.length <= 4 || arguments[4] === undefined ? false : arguments[4];

      var properties = undefined;
      if (emptySelection === true) {
        properties = { nodes: [], edges: [] };
      } else {
        properties = this.getSelection();
      }
      properties['pointer'] = {
        DOM: { x: pointer.x, y: pointer.y },
        canvas: this.canvas.DOMtoCanvas(pointer)
      };
      properties['event'] = event;

      if (oldSelection !== undefined) {
        properties['previousSelection'] = oldSelection;
      }
      this.body.emitter.emit(eventType, properties);
    }
  }, {
    key: "selectObject",
    value: function selectObject(obj) {
      var highlightEdges = arguments.length <= 1 || arguments[1] === undefined ? this.options.selectConnectedEdges : arguments[1];

      if (obj !== undefined) {
        if (obj instanceof Node) {
          if (highlightEdges === true) {
            this._selectConnectedEdges(obj);
          }
        }
        obj.select();
        this._addToSelection(obj);
        return true;
      }
      return false;
    }
  }, {
    key: "deselectObject",
    value: function deselectObject(obj) {
      if (obj.isSelected() === true) {
        obj.selected = false;
        this._removeFromSelection(obj);
      }
    }

    /**
     * retrieve all nodes overlapping with given object
     * @param {Object} object  An object with parameters left, top, right, bottom
     * @return {Number[]}   An array with id's of the overlapping nodes
     * @private
     */
  }, {
    key: "_getAllNodesOverlappingWith",
    value: function _getAllNodesOverlappingWith(object) {
      var overlappingNodes = [];
      var nodes = this.body.nodes;
      for (var i = 0; i < this.body.nodeIndices.length; i++) {
        var nodeId = this.body.nodeIndices[i];
        if (nodes[nodeId].isOverlappingWith(object)) {
          overlappingNodes.push(nodeId);
        }
      }
      return overlappingNodes;
    }

    /**
     * Return a position object in canvasspace from a single point in screenspace
     *
     * @param pointer
     * @returns {{left: number, top: number, right: number, bottom: number}}
     * @private
     */
  }, {
    key: "_pointerToPositionObject",
    value: function _pointerToPositionObject(pointer) {
      var canvasPos = this.canvas.DOMtoCanvas(pointer);
      return {
        left: canvasPos.x - 1,
        top: canvasPos.y + 1,
        right: canvasPos.x + 1,
        bottom: canvasPos.y - 1
      };
    }

    /**
     * Get the top node at the a specific point (like a click)
     *
     * @param {{x: Number, y: Number}} pointer
     * @return {Node | undefined} node
     */
  }, {
    key: "getNodeAt",
    value: function getNodeAt(pointer) {
      var returnNode = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      // we first check if this is an navigation controls element
      var positionObject = this._pointerToPositionObject(pointer);
      var overlappingNodes = this._getAllNodesOverlappingWith(positionObject);
      // if there are overlapping nodes, select the last one, this is the
      // one which is drawn on top of the others
      if (overlappingNodes.length > 0) {
        if (returnNode === true) {
          return this.body.nodes[overlappingNodes[overlappingNodes.length - 1]];
        } else {
          return overlappingNodes[overlappingNodes.length - 1];
        }
      } else {
        return undefined;
      }
    }

    /**
     * retrieve all edges overlapping with given object, selector is around center
     * @param {Object} object  An object with parameters left, top, right, bottom
     * @return {Number[]}   An array with id's of the overlapping nodes
     * @private
     */
  }, {
    key: "_getEdgesOverlappingWith",
    value: function _getEdgesOverlappingWith(object, overlappingEdges) {
      var edges = this.body.edges;
      for (var i = 0; i < this.body.edgeIndices.length; i++) {
        var edgeId = this.body.edgeIndices[i];
        if (edges[edgeId].isOverlappingWith(object)) {
          overlappingEdges.push(edgeId);
        }
      }
    }

    /**
     * retrieve all nodes overlapping with given object
     * @param {Object} object  An object with parameters left, top, right, bottom
     * @return {Number[]}   An array with id's of the overlapping nodes
     * @private
     */
  }, {
    key: "_getAllEdgesOverlappingWith",
    value: function _getAllEdgesOverlappingWith(object) {
      var overlappingEdges = [];
      this._getEdgesOverlappingWith(object, overlappingEdges);
      return overlappingEdges;
    }

    /**
     * Place holder. To implement change the getNodeAt to a _getObjectAt. Have the _getObjectAt call
     * getNodeAt and _getEdgesAt, then priortize the selection to user preferences.
     *
     * @param pointer
     * @returns {undefined}
     */
  }, {
    key: "getEdgeAt",
    value: function getEdgeAt(pointer) {
      var returnEdge = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      var positionObject = this._pointerToPositionObject(pointer);
      var overlappingEdges = this._getAllEdgesOverlappingWith(positionObject);

      if (overlappingEdges.length > 0) {
        if (returnEdge === true) {
          return this.body.edges[overlappingEdges[overlappingEdges.length - 1]];
        } else {
          return overlappingEdges[overlappingEdges.length - 1];
        }
      } else {
        return undefined;
      }
    }

    /**
     * Add object to the selection array.
     *
     * @param obj
     * @private
     */
  }, {
    key: "_addToSelection",
    value: function _addToSelection(obj) {
      if (obj instanceof Node) {
        this.selectionObj.nodes[obj.id] = obj;
      } else {
        this.selectionObj.edges[obj.id] = obj;
      }
    }

    /**
     * Add object to the selection array.
     *
     * @param obj
     * @private
     */
  }, {
    key: "_addToHover",
    value: function _addToHover(obj) {
      if (obj instanceof Node) {
        this.hoverObj.nodes[obj.id] = obj;
      } else {
        this.hoverObj.edges[obj.id] = obj;
      }
    }

    /**
     * Remove a single option from selection.
     *
     * @param {Object} obj
     * @private
     */
  }, {
    key: "_removeFromSelection",
    value: function _removeFromSelection(obj) {
      if (obj instanceof Node) {
        delete this.selectionObj.nodes[obj.id];
        this._unselectConnectedEdges(obj);
      } else {
        delete this.selectionObj.edges[obj.id];
      }
    }

    /**
     * Unselect all. The selectionObj is useful for this.
     */
  }, {
    key: "unselectAll",
    value: function unselectAll() {
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          this.selectionObj.nodes[nodeId].unselect();
        }
      }
      for (var edgeId in this.selectionObj.edges) {
        if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
          this.selectionObj.edges[edgeId].unselect();
        }
      }

      this.selectionObj = { nodes: {}, edges: {} };
    }

    /**
     * return the number of selected nodes
     *
     * @returns {number}
     * @private
     */
  }, {
    key: "_getSelectedNodeCount",
    value: function _getSelectedNodeCount() {
      var count = 0;
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          count += 1;
        }
      }
      return count;
    }

    /**
     * return the selected node
     *
     * @returns {number}
     * @private
     */
  }, {
    key: "_getSelectedNode",
    value: function _getSelectedNode() {
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          return this.selectionObj.nodes[nodeId];
        }
      }
      return undefined;
    }

    /**
     * return the selected edge
     *
     * @returns {number}
     * @private
     */
  }, {
    key: "_getSelectedEdge",
    value: function _getSelectedEdge() {
      for (var edgeId in this.selectionObj.edges) {
        if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
          return this.selectionObj.edges[edgeId];
        }
      }
      return undefined;
    }

    /**
     * return the number of selected edges
     *
     * @returns {number}
     * @private
     */
  }, {
    key: "_getSelectedEdgeCount",
    value: function _getSelectedEdgeCount() {
      var count = 0;
      for (var edgeId in this.selectionObj.edges) {
        if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
          count += 1;
        }
      }
      return count;
    }

    /**
     * return the number of selected objects.
     *
     * @returns {number}
     * @private
     */
  }, {
    key: "_getSelectedObjectCount",
    value: function _getSelectedObjectCount() {
      var count = 0;
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          count += 1;
        }
      }
      for (var edgeId in this.selectionObj.edges) {
        if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
          count += 1;
        }
      }
      return count;
    }

    /**
     * Check if anything is selected
     *
     * @returns {boolean}
     * @private
     */
  }, {
    key: "_selectionIsEmpty",
    value: function _selectionIsEmpty() {
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          return false;
        }
      }
      for (var edgeId in this.selectionObj.edges) {
        if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
          return false;
        }
      }
      return true;
    }

    /**
     * check if one of the selected nodes is a cluster.
     *
     * @returns {boolean}
     * @private
     */
  }, {
    key: "_clusterInSelection",
    value: function _clusterInSelection() {
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          if (this.selectionObj.nodes[nodeId].clusterSize > 1) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * select the edges connected to the node that is being selected
     *
     * @param {Node} node
     * @private
     */
  }, {
    key: "_selectConnectedEdges",
    value: function _selectConnectedEdges(node) {
      for (var i = 0; i < node.edges.length; i++) {
        var edge = node.edges[i];
        edge.select();
        this._addToSelection(edge);
      }
    }

    /**
     * select the edges connected to the node that is being selected
     *
     * @param {Node} node
     * @private
     */
  }, {
    key: "_hoverConnectedEdges",
    value: function _hoverConnectedEdges(node) {
      for (var i = 0; i < node.edges.length; i++) {
        var edge = node.edges[i];
        edge.hover = true;
        this._addToHover(edge);
      }
    }

    /**
     * unselect the edges connected to the node that is being selected
     *
     * @param {Node} node
     * @private
     */
  }, {
    key: "_unselectConnectedEdges",
    value: function _unselectConnectedEdges(node) {
      for (var i = 0; i < node.edges.length; i++) {
        var edge = node.edges[i];
        edge.unselect();
        this._removeFromSelection(edge);
      }
    }

    /**
     * This is called when someone clicks on a node. either select or deselect it.
     * If there is an existing selection and we don't want to append to it, clear the existing selection
     *
     * @param {Node || Edge} object
     * @private
     */
  }, {
    key: "blurObject",
    value: function blurObject(object) {
      if (object.hover === true) {
        object.hover = false;
        if (object instanceof Node) {
          this.body.emitter.emit("blurNode", { node: object.id });
        } else {
          this.body.emitter.emit("blurEdge", { edge: object.id });
        }
      }
    }

    /**
     * This is called when someone clicks on a node. either select or deselect it.
     * If there is an existing selection and we don't want to append to it, clear the existing selection
     *
     * @param {Node || Edge} object
     * @private
     */
  }, {
    key: "hoverObject",
    value: function hoverObject(object) {
      var hoverChanged = false;
      // remove all node hover highlights
      for (var nodeId in this.hoverObj.nodes) {
        if (this.hoverObj.nodes.hasOwnProperty(nodeId)) {
          if (object === undefined || object instanceof Node && object.id != nodeId || object instanceof Edge) {
            this.blurObject(this.hoverObj.nodes[nodeId]);
            delete this.hoverObj.nodes[nodeId];
            hoverChanged = true;
          }
        }
      }

      // removing all edge hover highlights
      for (var edgeId in this.hoverObj.edges) {
        if (this.hoverObj.edges.hasOwnProperty(edgeId)) {
          // if the hover has been changed here it means that the node has been hovered over or off
          // we then do not use the blurObject method here.
          if (hoverChanged === true) {
            this.hoverObj.edges[edgeId].hover = false;
            delete this.hoverObj.edges[edgeId];
          }
          // if the blur remains the same and the object is undefined (mouse off), we blur the edge
          else if (object === undefined) {
              this.blurObject(this.hoverObj.edges[edgeId]);
              delete this.hoverObj.edges[edgeId];
              hoverChanged = true;
            }
        }
      }

      if (object !== undefined) {
        if (object.hover === false) {
          object.hover = true;
          this._addToHover(object);
          hoverChanged = true;
          if (object instanceof Node) {
            this.body.emitter.emit("hoverNode", { node: object.id });
          } else {
            this.body.emitter.emit("hoverEdge", { edge: object.id });
          }
        }
        if (object instanceof Node && this.options.hoverConnectedEdges === true) {
          this._hoverConnectedEdges(object);
        }
      }

      if (hoverChanged === true) {
        this.body.emitter.emit('_requestRedraw');
      }
    }

    /**
     *
     * retrieve the currently selected objects
     * @return {{nodes: Array.<String>, edges: Array.<String>}} selection
     */
  }, {
    key: "getSelection",
    value: function getSelection() {
      var nodeIds = this.getSelectedNodes();
      var edgeIds = this.getSelectedEdges();
      return { nodes: nodeIds, edges: edgeIds };
    }

    /**
     *
     * retrieve the currently selected nodes
     * @return {String[]} selection    An array with the ids of the
     *                                            selected nodes.
     */
  }, {
    key: "getSelectedNodes",
    value: function getSelectedNodes() {
      var idArray = [];
      if (this.options.selectable === true) {
        for (var nodeId in this.selectionObj.nodes) {
          if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
            idArray.push(nodeId);
          }
        }
      }
      return idArray;
    }

    /**
     *
     * retrieve the currently selected edges
     * @return {Array} selection    An array with the ids of the
     *                                            selected nodes.
     */
  }, {
    key: "getSelectedEdges",
    value: function getSelectedEdges() {
      var idArray = [];
      if (this.options.selectable === true) {
        for (var edgeId in this.selectionObj.edges) {
          if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
            idArray.push(edgeId);
          }
        }
      }
      return idArray;
    }

    /**
     * Updates the current selection
     * @param {{nodes: Array.<String>, edges: Array.<String>}} Selection
     * @param {Object} options                                 Options
     */
  }, {
    key: "setSelection",
    value: function setSelection(selection) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      var i = undefined,
          id = undefined;

      if (!selection || !selection.nodes && !selection.edges) throw 'Selection must be an object with nodes and/or edges properties';
      // first unselect any selected node, if option is true or undefined
      if (options.unselectAll || options.unselectAll === undefined) {
        this.unselectAll();
      }
      if (selection.nodes) {
        for (i = 0; i < selection.nodes.length; i++) {
          id = selection.nodes[i];

          var node = this.body.nodes[id];
          if (!node) {
            throw new RangeError('Node with id "' + id + '" not found');
          }
          // don't select edges with it
          this.selectObject(node, options.highlightEdges);
        }
      }

      if (selection.edges) {
        for (i = 0; i < selection.edges.length; i++) {
          id = selection.edges[i];

          var edge = this.body.edges[id];
          if (!edge) {
            throw new RangeError('Edge with id "' + id + '" not found');
          }
          this.selectObject(edge);
        }
      }
      this.body.emitter.emit('_requestRedraw');
    }

    /**
     * select zero or more nodes with the option to highlight edges
     * @param {Number[] | String[]} selection     An array with the ids of the
     *                                            selected nodes.
     * @param {boolean} [highlightEdges]
     */
  }, {
    key: "selectNodes",
    value: function selectNodes(selection) {
      var highlightEdges = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      if (!selection || selection.length === undefined) throw 'Selection must be an array with ids';

      this.setSelection({ nodes: selection }, { highlightEdges: highlightEdges });
    }

    /**
     * select zero or more edges
     * @param {Number[] | String[]} selection     An array with the ids of the
     *                                            selected nodes.
     */
  }, {
    key: "selectEdges",
    value: function selectEdges(selection) {
      if (!selection || selection.length === undefined) throw 'Selection must be an array with ids';

      this.setSelection({ edges: selection });
    }

    /**
     * Validate the selection: remove ids of nodes which no longer exist
     * @private
     */
  }, {
    key: "updateSelection",
    value: function updateSelection() {
      for (var nodeId in this.selectionObj.nodes) {
        if (this.selectionObj.nodes.hasOwnProperty(nodeId)) {
          if (!this.body.nodes.hasOwnProperty(nodeId)) {
            delete this.selectionObj.nodes[nodeId];
          }
        }
      }
      for (var edgeId in this.selectionObj.edges) {
        if (this.selectionObj.edges.hasOwnProperty(edgeId)) {
          if (!this.body.edges.hasOwnProperty(edgeId)) {
            delete this.selectionObj.edges[edgeId];
          }
        }
      }
    }
  }]);

  return SelectionHandler;
})();

exports["default"] = SelectionHandler;
module.exports = exports["default"];

},{"../../util":73,"./components/Edge":28,"./components/Node":30}],27:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _NetworkUtil = require('../NetworkUtil');

var _NetworkUtil2 = _interopRequireDefault(_NetworkUtil);

var util = require('../../util');

var View = (function () {
  function View(body, canvas) {
    var _this = this;

    _classCallCheck(this, View);

    this.body = body;
    this.canvas = canvas;

    this.animationSpeed = 1 / this.renderRefreshRate;
    this.animationEasingFunction = "easeInOutQuint";
    this.easingTime = 0;
    this.sourceScale = 0;
    this.targetScale = 0;
    this.sourceTranslation = 0;
    this.targetTranslation = 0;
    this.lockedOnNodeId = undefined;
    this.lockedOnNodeOffset = undefined;
    this.touchTime = 0;

    this.viewFunction = undefined;

    this.body.emitter.on("fit", this.fit.bind(this));
    this.body.emitter.on("animationFinished", function () {
      _this.body.emitter.emit("_stopRendering");
    });
    this.body.emitter.on("unlockNode", this.releaseNode.bind(this));
  }

  _createClass(View, [{
    key: 'setOptions',
    value: function setOptions() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      this.options = options;
    }

    /**
     * This function zooms out to fit all data on screen based on amount of nodes
     * @param {Object} Options
     * @param {Boolean} [initialZoom]  | zoom based on fitted formula or range, true = fitted, default = false;
     */
  }, {
    key: 'fit',
    value: function fit() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? { nodes: [] } : arguments[0];
      var initialZoom = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var range = undefined;
      var zoomLevel = undefined;
      if (options.nodes === undefined || options.nodes.length === 0) {
        options.nodes = this.body.nodeIndices;
      }

      if (initialZoom === true) {
        // check if more than half of the nodes have a predefined position. If so, we use the range, not the approximation.
        var positionDefined = 0;
        for (var nodeId in this.body.nodes) {
          if (this.body.nodes.hasOwnProperty(nodeId)) {
            var node = this.body.nodes[nodeId];
            if (node.predefinedPosition === true) {
              positionDefined += 1;
            }
          }
        }
        if (positionDefined > 0.5 * this.body.nodeIndices.length) {
          this.fit(options, false);
          return;
        }

        range = _NetworkUtil2['default']._getRange(this.body.nodes, options.nodes);

        var numberOfNodes = this.body.nodeIndices.length;
        zoomLevel = 12.662 / (numberOfNodes + 7.4147) + 0.0964822; // this is obtained from fitting a dataset from 5 points with scale levels that looked good.

        // correct for larger canvasses.
        var factor = Math.min(this.canvas.frame.canvas.clientWidth / 600, this.canvas.frame.canvas.clientHeight / 600);
        zoomLevel *= factor;
      } else {
        this.body.emitter.emit("_resizeNodes");
        range = _NetworkUtil2['default']._getRange(this.body.nodes, options.nodes);

        var xDistance = Math.abs(range.maxX - range.minX) * 1.1;
        var yDistance = Math.abs(range.maxY - range.minY) * 1.1;

        var xZoomLevel = this.canvas.frame.canvas.clientWidth / xDistance;
        var yZoomLevel = this.canvas.frame.canvas.clientHeight / yDistance;

        zoomLevel = xZoomLevel <= yZoomLevel ? xZoomLevel : yZoomLevel;
      }

      if (zoomLevel > 1.0) {
        zoomLevel = 1.0;
      } else if (zoomLevel === 0) {
        zoomLevel = 1.0;
      }

      var center = _NetworkUtil2['default']._findCenter(range);
      var animationOptions = { position: center, scale: zoomLevel, animation: options.animation };
      this.moveTo(animationOptions);
    }

    // animation

    /**
     * Center a node in view.
     *
     * @param {Number} nodeId
     * @param {Number} [options]
     */
  }, {
    key: 'focus',
    value: function focus(nodeId) {
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      if (this.body.nodes[nodeId] !== undefined) {
        var nodePosition = { x: this.body.nodes[nodeId].x, y: this.body.nodes[nodeId].y };
        options.position = nodePosition;
        options.lockedOnNode = nodeId;

        this.moveTo(options);
      } else {
        console.log("Node: " + nodeId + " cannot be found.");
      }
    }

    /**
     *
     * @param {Object} options  |  options.offset   = {x:Number, y:Number}   // offset from the center in DOM pixels
     *                          |  options.scale    = Number                 // scale to move to
     *                          |  options.position = {x:Number, y:Number}   // position to move to
     *                          |  options.animation = {duration:Number, easingFunction:String} || Boolean   // position to move to
     */
  }, {
    key: 'moveTo',
    value: function moveTo(options) {
      if (options === undefined) {
        options = {};
        return;
      }
      if (options.offset === undefined) {
        options.offset = { x: 0, y: 0 };
      }
      if (options.offset.x === undefined) {
        options.offset.x = 0;
      }
      if (options.offset.y === undefined) {
        options.offset.y = 0;
      }
      if (options.scale === undefined) {
        options.scale = this.body.view.scale;
      }
      if (options.position === undefined) {
        options.position = this.getViewPosition();
      }
      if (options.animation === undefined) {
        options.animation = { duration: 0 };
      }
      if (options.animation === false) {
        options.animation = { duration: 0 };
      }
      if (options.animation === true) {
        options.animation = {};
      }
      if (options.animation.duration === undefined) {
        options.animation.duration = 1000;
      } // default duration
      if (options.animation.easingFunction === undefined) {
        options.animation.easingFunction = "easeInOutQuad";
      } // default easing function

      this.animateView(options);
    }

    /**
     *
     * @param {Object} options  |  options.offset   = {x:Number, y:Number}   // offset from the center in DOM pixels
     *                          |  options.time     = Number                 // animation time in milliseconds
     *                          |  options.scale    = Number                 // scale to animate to
     *                          |  options.position = {x:Number, y:Number}   // position to animate to
     *                          |  options.easingFunction = String           // linear, easeInQuad, easeOutQuad, easeInOutQuad,
     *                                                                       // easeInCubic, easeOutCubic, easeInOutCubic,
     *                                                                       // easeInQuart, easeOutQuart, easeInOutQuart,
     *                                                                       // easeInQuint, easeOutQuint, easeInOutQuint
     */
  }, {
    key: 'animateView',
    value: function animateView(options) {
      if (options === undefined) {
        return;
      }
      this.animationEasingFunction = options.animation.easingFunction;
      // release if something focussed on the node
      this.releaseNode();
      if (options.locked === true) {
        this.lockedOnNodeId = options.lockedOnNode;
        this.lockedOnNodeOffset = options.offset;
      }

      // forcefully complete the old animation if it was still running
      if (this.easingTime != 0) {
        this._transitionRedraw(true); // by setting easingtime to 1, we finish the animation.
      }

      this.sourceScale = this.body.view.scale;
      this.sourceTranslation = this.body.view.translation;
      this.targetScale = options.scale;

      // set the scale so the viewCenter is based on the correct zoom level. This is overridden in the transitionRedraw
      // but at least then we'll have the target transition
      this.body.view.scale = this.targetScale;
      var viewCenter = this.canvas.DOMtoCanvas({ x: 0.5 * this.canvas.frame.canvas.clientWidth, y: 0.5 * this.canvas.frame.canvas.clientHeight });

      var distanceFromCenter = { // offset from view, distance view has to change by these x and y to center the node
        x: viewCenter.x - options.position.x,
        y: viewCenter.y - options.position.y
      };
      this.targetTranslation = {
        x: this.sourceTranslation.x + distanceFromCenter.x * this.targetScale + options.offset.x,
        y: this.sourceTranslation.y + distanceFromCenter.y * this.targetScale + options.offset.y
      };

      // if the time is set to 0, don't do an animation
      if (options.animation.duration === 0) {
        if (this.lockedOnNodeId != undefined) {
          this.viewFunction = this._lockedRedraw.bind(this);
          this.body.emitter.on("initRedraw", this.viewFunction);
        } else {
          this.body.view.scale = this.targetScale;
          this.body.view.translation = this.targetTranslation;
          this.body.emitter.emit("_requestRedraw");
        }
      } else {
        this.animationSpeed = 1 / (60 * options.animation.duration * 0.001) || 1 / 60; // 60 for 60 seconds, 0.001 for milli's
        this.animationEasingFunction = options.animation.easingFunction;

        this.viewFunction = this._transitionRedraw.bind(this);
        this.body.emitter.on("initRedraw", this.viewFunction);
        this.body.emitter.emit("_startRendering");
      }
    }

    /**
     * used to animate smoothly by hijacking the redraw function.
     * @private
     */
  }, {
    key: '_lockedRedraw',
    value: function _lockedRedraw() {
      var nodePosition = { x: this.body.nodes[this.lockedOnNodeId].x, y: this.body.nodes[this.lockedOnNodeId].y };
      var viewCenter = this.canvas.DOMtoCanvas({ x: 0.5 * this.canvas.frame.canvas.clientWidth, y: 0.5 * this.canvas.frame.canvas.clientHeight });
      var distanceFromCenter = { // offset from view, distance view has to change by these x and y to center the node
        x: viewCenter.x - nodePosition.x,
        y: viewCenter.y - nodePosition.y
      };
      var sourceTranslation = this.body.view.translation;
      var targetTranslation = {
        x: sourceTranslation.x + distanceFromCenter.x * this.body.view.scale + this.lockedOnNodeOffset.x,
        y: sourceTranslation.y + distanceFromCenter.y * this.body.view.scale + this.lockedOnNodeOffset.y
      };

      this.body.view.translation = targetTranslation;
    }
  }, {
    key: 'releaseNode',
    value: function releaseNode() {
      if (this.lockedOnNodeId !== undefined && this.viewFunction !== undefined) {
        this.body.emitter.off("initRedraw", this.viewFunction);
        this.lockedOnNodeId = undefined;
        this.lockedOnNodeOffset = undefined;
      }
    }

    /**
     *
     * @param easingTime
     * @private
     */
  }, {
    key: '_transitionRedraw',
    value: function _transitionRedraw() {
      var finished = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

      this.easingTime += this.animationSpeed;
      this.easingTime = finished === true ? 1.0 : this.easingTime;

      var progress = util.easingFunctions[this.animationEasingFunction](this.easingTime);

      this.body.view.scale = this.sourceScale + (this.targetScale - this.sourceScale) * progress;
      this.body.view.translation = {
        x: this.sourceTranslation.x + (this.targetTranslation.x - this.sourceTranslation.x) * progress,
        y: this.sourceTranslation.y + (this.targetTranslation.y - this.sourceTranslation.y) * progress
      };

      // cleanup
      if (this.easingTime >= 1.0) {
        this.body.emitter.off("initRedraw", this.viewFunction);
        this.easingTime = 0;
        if (this.lockedOnNodeId != undefined) {
          this.viewFunction = this._lockedRedraw.bind(this);
          this.body.emitter.on("initRedraw", this.viewFunction);
        }
        this.body.emitter.emit("animationFinished");
      }
    }
  }, {
    key: 'getScale',
    value: function getScale() {
      return this.body.view.scale;
    }
  }, {
    key: 'getViewPosition',
    value: function getViewPosition() {
      return this.canvas.DOMtoCanvas({ x: 0.5 * this.canvas.frame.canvas.clientWidth, y: 0.5 * this.canvas.frame.canvas.clientHeight });
    }
  }]);

  return View;
})();

exports['default'] = View;
module.exports = exports['default'];

},{"../../util":73,"../NetworkUtil":11}],28:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _sharedLabel = require('./shared/Label');

var _sharedLabel2 = _interopRequireDefault(_sharedLabel);

var _edgesCubicBezierEdge = require('./edges/CubicBezierEdge');

var _edgesCubicBezierEdge2 = _interopRequireDefault(_edgesCubicBezierEdge);

var _edgesBezierEdgeDynamic = require('./edges/BezierEdgeDynamic');

var _edgesBezierEdgeDynamic2 = _interopRequireDefault(_edgesBezierEdgeDynamic);

var _edgesBezierEdgeStatic = require('./edges/BezierEdgeStatic');

var _edgesBezierEdgeStatic2 = _interopRequireDefault(_edgesBezierEdgeStatic);

var _edgesStraightEdge = require('./edges/StraightEdge');

var _edgesStraightEdge2 = _interopRequireDefault(_edgesStraightEdge);

/**
 * @class Edge
 *
 * A edge connects two nodes
 * @param {Object} properties     Object with options. Must contain
 *                                At least options from and to.
 *                                Available options: from (number),
 *                                to (number), label (string, color (string),
 *                                width (number), style (string),
 *                                length (number), title (string)
 * @param {Network} network       A Network object, used to find and edge to
 *                                nodes.
 * @param {Object} constants      An object with default values for
 *                                example for the color
 */
var util = require('../../../util');

var Edge = (function () {
  function Edge(options, body, globalOptions) {
    _classCallCheck(this, Edge);

    if (body === undefined) {
      throw "No body provided";
    }
    this.options = util.bridgeObject(globalOptions);
    this.globalOptions = globalOptions;
    this.body = body;

    // initialize variables
    this.id = undefined;
    this.fromId = undefined;
    this.toId = undefined;
    this.selected = false;
    this.hover = false;
    this.labelDirty = true;
    this.colorDirty = true;

    this.baseWidth = this.options.width;
    this.baseFontSize = this.options.font.size;

    this.from = undefined; // a node
    this.to = undefined; // a node

    this.edgeType = undefined;

    this.connected = false;

    this.labelModule = new _sharedLabel2['default'](this.body, this.options);

    this.setOptions(options);
  }

  /**
   * Set or overwrite options for the edge
   * @param {Object} options  an object with options
   * @param doNotEmit
   */

  _createClass(Edge, [{
    key: 'setOptions',
    value: function setOptions(options) {
      if (!options) {
        return;
      }
      this.colorDirty = true;

      Edge.parseOptions(this.options, options, true, this.globalOptions);

      if (options.id !== undefined) {
        this.id = options.id;
      }
      if (options.from !== undefined) {
        this.fromId = options.from;
      }
      if (options.to !== undefined) {
        this.toId = options.to;
      }
      if (options.title !== undefined) {
        this.title = options.title;
      }
      if (options.value !== undefined) {
        options.value = parseFloat(options.value);
      }

      // update label Module
      this.updateLabelModule();

      var dataChanged = this.updateEdgeType();

      // if anything has been updates, reset the selection width and the hover width
      this._setInteractionWidths();

      // A node is connected when it has a from and to node that both exist in the network.body.nodes.
      this.connect();

      if (options.hidden !== undefined || options.physics !== undefined) {
        dataChanged = true;
      }

      return dataChanged;
    }
  }, {
    key: 'updateLabelModule',
    // set the object back to the global options

    /**
     * update the options in the label module
     */
    value: function updateLabelModule() {
      this.labelModule.setOptions(this.options, true);
      if (this.labelModule.baseSize !== undefined) {
        this.baseFontSize = this.labelModule.baseSize;
      }
    }

    /**
     * update the edge type, set the options
     * @returns {boolean}
     */
  }, {
    key: 'updateEdgeType',
    value: function updateEdgeType() {
      var dataChanged = false;
      var changeInType = true;
      var smooth = this.options.smooth;
      if (this.edgeType !== undefined) {
        if (this.edgeType instanceof _edgesBezierEdgeDynamic2['default'] && smooth.enabled === true && smooth.type === 'dynamic') {
          changeInType = false;
        }
        if (this.edgeType instanceof _edgesCubicBezierEdge2['default'] && smooth.enabled === true && smooth.type === 'cubicBezier') {
          changeInType = false;
        }
        if (this.edgeType instanceof _edgesBezierEdgeStatic2['default'] && smooth.enabled === true && smooth.type !== 'dynamic' && smooth.type !== 'cubicBezier') {
          changeInType = false;
        }
        if (this.edgeType instanceof _edgesStraightEdge2['default'] && smooth.enabled === false) {
          changeInType = false;
        }

        if (changeInType === true) {
          dataChanged = this.cleanup();
        }
      }

      if (changeInType === true) {
        if (this.options.smooth.enabled === true) {
          if (this.options.smooth.type === 'dynamic') {
            dataChanged = true;
            this.edgeType = new _edgesBezierEdgeDynamic2['default'](this.options, this.body, this.labelModule);
          } else if (this.options.smooth.type === 'cubicBezier') {
            this.edgeType = new _edgesCubicBezierEdge2['default'](this.options, this.body, this.labelModule);
          } else {
            this.edgeType = new _edgesBezierEdgeStatic2['default'](this.options, this.body, this.labelModule);
          }
        } else {
          this.edgeType = new _edgesStraightEdge2['default'](this.options, this.body, this.labelModule);
        }
      } else {
        // if nothing changes, we just set the options.
        this.edgeType.setOptions(this.options);
      }

      return dataChanged;
    }

    /**
     * Connect an edge to its nodes
     */
  }, {
    key: 'connect',
    value: function connect() {
      this.disconnect();

      this.from = this.body.nodes[this.fromId] || undefined;
      this.to = this.body.nodes[this.toId] || undefined;
      this.connected = this.from !== undefined && this.to !== undefined;

      if (this.connected === true) {
        this.from.attachEdge(this);
        this.to.attachEdge(this);
      } else {
        if (this.from) {
          this.from.detachEdge(this);
        }
        if (this.to) {
          this.to.detachEdge(this);
        }
      }

      this.edgeType.connect();
    }

    /**
     * Disconnect an edge from its nodes
     */
  }, {
    key: 'disconnect',
    value: function disconnect() {
      if (this.from) {
        this.from.detachEdge(this);
        this.from = undefined;
      }
      if (this.to) {
        this.to.detachEdge(this);
        this.to = undefined;
      }

      this.connected = false;
    }

    /**
     * get the title of this edge.
     * @return {string} title    The title of the edge, or undefined when no title
     *                           has been set.
     */
  }, {
    key: 'getTitle',
    value: function getTitle() {
      return this.title;
    }

    /**
     * check if this node is selecte
     * @return {boolean} selected   True if node is selected, else false
     */
  }, {
    key: 'isSelected',
    value: function isSelected() {
      return this.selected;
    }

    /**
     * Retrieve the value of the edge. Can be undefined
     * @return {Number} value
     */
  }, {
    key: 'getValue',
    value: function getValue() {
      return this.options.value;
    }

    /**
     * Adjust the value range of the edge. The edge will adjust it's width
     * based on its value.
     * @param {Number} min
     * @param {Number} max
     * @param total
     */
  }, {
    key: 'setValueRange',
    value: function setValueRange(min, max, total) {
      if (this.options.value !== undefined) {
        var scale = this.options.scaling.customScalingFunction(min, max, total, this.options.value);
        var widthDiff = this.options.scaling.max - this.options.scaling.min;
        if (this.options.scaling.label.enabled === true) {
          var fontDiff = this.options.scaling.label.max - this.options.scaling.label.min;
          this.options.font.size = this.options.scaling.label.min + scale * fontDiff;
        }
        this.options.width = this.options.scaling.min + scale * widthDiff;
      } else {
        this.options.width = this.baseWidth;
        this.options.font.size = this.baseFontSize;
      }

      this._setInteractionWidths();
      this.updateLabelModule();
    }
  }, {
    key: '_setInteractionWidths',
    value: function _setInteractionWidths() {
      if (typeof this.options.hoverWidth === 'function') {
        this.edgeType.hoverWidth = this.options.hoverWidth(this.options.width);
      } else {
        this.edgeType.hoverWidth = this.options.hoverWidth + this.options.width;
      }

      if (typeof this.options.selectionWidth === 'function') {
        this.edgeType.selectionWidth = this.options.selectionWidth(this.options.width);
      } else {
        this.edgeType.selectionWidth = this.options.selectionWidth + this.options.width;
      }
    }

    /**
     * Redraw a edge
     * Draw this edge in the given canvas
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
     * @param {CanvasRenderingContext2D}   ctx
     */
  }, {
    key: 'draw',
    value: function draw(ctx) {
      var via = this.edgeType.drawLine(ctx, this.selected, this.hover);
      this.drawArrows(ctx, via);
      this.drawLabel(ctx, via);
    }
  }, {
    key: 'drawArrows',
    value: function drawArrows(ctx, viaNode) {
      if (this.options.arrows.from.enabled === true) {
        this.edgeType.drawArrowHead(ctx, 'from', viaNode, this.selected, this.hover);
      }
      if (this.options.arrows.middle.enabled === true) {
        this.edgeType.drawArrowHead(ctx, 'middle', viaNode, this.selected, this.hover);
      }
      if (this.options.arrows.to.enabled === true) {
        this.edgeType.drawArrowHead(ctx, 'to', viaNode, this.selected, this.hover);
      }
    }
  }, {
    key: 'drawLabel',
    value: function drawLabel(ctx, viaNode) {
      if (this.options.label !== undefined) {
        // set style
        var node1 = this.from;
        var node2 = this.to;
        var selected = this.from.selected || this.to.selected || this.selected;
        if (node1.id != node2.id) {
          this.labelModule.pointToSelf = false;
          var point = this.edgeType.getPoint(0.5, viaNode);
          ctx.save();

          // if the label has to be rotated:
          if (this.options.font.align !== "horizontal") {
            this.labelModule.calculateLabelSize(ctx, selected, point.x, point.y);
            ctx.translate(point.x, this.labelModule.size.yLine);
            this._rotateForLabelAlignment(ctx);
          }

          // draw the label
          this.labelModule.draw(ctx, point.x, point.y, selected);
          ctx.restore();
        } else {
          // Ignore the orientations.
          this.labelModule.pointToSelf = true;
          var x, y;
          var radius = this.options.selfReferenceSize;
          if (node1.shape.width > node1.shape.height) {
            x = node1.x + node1.shape.width * 0.5;
            y = node1.y - radius;
          } else {
            x = node1.x + radius;
            y = node1.y - node1.shape.height * 0.5;
          }
          point = this._pointOnCircle(x, y, radius, 0.125);
          this.labelModule.draw(ctx, point.x, point.y, selected);
        }
      }
    }

    /**
     * Check if this object is overlapping with the provided object
     * @param {Object} obj   an object with parameters left, top
     * @return {boolean}     True if location is located on the edge
     */
  }, {
    key: 'isOverlappingWith',
    value: function isOverlappingWith(obj) {
      if (this.connected) {
        var distMax = 10;
        var xFrom = this.from.x;
        var yFrom = this.from.y;
        var xTo = this.to.x;
        var yTo = this.to.y;
        var xObj = obj.left;
        var yObj = obj.top;

        var dist = this.edgeType.getDistanceToEdge(xFrom, yFrom, xTo, yTo, xObj, yObj);

        return dist < distMax;
      } else {
        return false;
      }
    }

    /**
     * Rotates the canvas so the text is most readable
     * @param {CanvasRenderingContext2D} ctx
     * @private
     */
  }, {
    key: '_rotateForLabelAlignment',
    value: function _rotateForLabelAlignment(ctx) {
      var dy = this.from.y - this.to.y;
      var dx = this.from.x - this.to.x;
      var angleInDegrees = Math.atan2(dy, dx);

      // rotate so label it is readable
      if (angleInDegrees < -1 && dx < 0 || angleInDegrees > 0 && dx < 0) {
        angleInDegrees = angleInDegrees + Math.PI;
      }

      ctx.rotate(angleInDegrees);
    }

    /**
     * Get a point on a circle
     * @param {Number} x
     * @param {Number} y
     * @param {Number} radius
     * @param {Number} percentage. Value between 0 (line start) and 1 (line end)
     * @return {Object} point
     * @private
     */
  }, {
    key: '_pointOnCircle',
    value: function _pointOnCircle(x, y, radius, percentage) {
      var angle = percentage * 2 * Math.PI;
      return {
        x: x + radius * Math.cos(angle),
        y: y - radius * Math.sin(angle)
      };
    }
  }, {
    key: 'select',
    value: function select() {
      this.selected = true;
    }
  }, {
    key: 'unselect',
    value: function unselect() {
      this.selected = false;
    }

    /**
     * cleans all required things on delete
     * @returns {*}
     */
  }, {
    key: 'cleanup',
    value: function cleanup() {
      return this.edgeType.cleanup();
    }
  }], [{
    key: 'parseOptions',
    value: function parseOptions(parentOptions, newOptions) {
      var allowDeletion = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];
      var globalOptions = arguments.length <= 3 || arguments[3] === undefined ? {} : arguments[3];

      var fields = ['id', 'from', 'hidden', 'hoverWidth', 'label', 'labelHighlightBold', 'length', 'line', 'opacity', 'physics', 'scaling', 'selectionWidth', 'selfReferenceSize', 'to', 'title', 'value', 'width'];

      // only deep extend the items in the field array. These do not have shorthand.
      util.selectiveDeepExtend(fields, parentOptions, newOptions, allowDeletion);

      util.mergeOptions(parentOptions, newOptions, 'smooth', allowDeletion, globalOptions);
      util.mergeOptions(parentOptions, newOptions, 'shadow', allowDeletion, globalOptions);

      if (newOptions.dashes !== undefined && newOptions.dashes !== null) {
        parentOptions.dashes = newOptions.dashes;
      } else if (allowDeletion === true && newOptions.dashes === null) {
        parentOptions.dashes = Object.create(globalOptions.dashes); // this sets the pointer of the option back to the global option.
      }

      // set the scaling newOptions
      if (newOptions.scaling !== undefined && newOptions.scaling !== null) {
        if (newOptions.scaling.min !== undefined) {
          parentOptions.scaling.min = newOptions.scaling.min;
        }
        if (newOptions.scaling.max !== undefined) {
          parentOptions.scaling.max = newOptions.scaling.max;
        }
        util.mergeOptions(parentOptions.scaling, newOptions.scaling, 'label', allowDeletion, globalOptions.scaling);
      } else if (allowDeletion === true && newOptions.scaling === null) {
        parentOptions.scaling = Object.create(globalOptions.scaling); // this sets the pointer of the option back to the global option.
      }

      // hanlde multiple input cases for arrows
      if (newOptions.arrows !== undefined && newOptions.arrows !== null) {
        if (typeof newOptions.arrows === 'string') {
          var arrows = newOptions.arrows.toLowerCase();
          if (arrows.indexOf("to") != -1) {
            parentOptions.arrows.to.enabled = true;
          }
          if (arrows.indexOf("middle") != -1) {
            parentOptions.arrows.middle.enabled = true;
          }
          if (arrows.indexOf("from") != -1) {
            parentOptions.arrows.from.enabled = true;
          }
        } else if (typeof newOptions.arrows === 'object') {
          util.mergeOptions(parentOptions.arrows, newOptions.arrows, 'to', allowDeletion, globalOptions.arrows);
          util.mergeOptions(parentOptions.arrows, newOptions.arrows, 'middle', allowDeletion, globalOptions.arrows);
          util.mergeOptions(parentOptions.arrows, newOptions.arrows, 'from', allowDeletion, globalOptions.arrows);
        } else {
          throw new Error("The arrow newOptions can only be an object or a string. Refer to the documentation. You used:" + JSON.stringify(newOptions.arrows));
        }
      } else if (allowDeletion === true && newOptions.arrows === null) {
        parentOptions.arrows = Object.create(globalOptions.arrows); // this sets the pointer of the option back to the global option.
      }

      // hanlde multiple input cases for color
      if (newOptions.color !== undefined && newOptions.color !== null) {
        // make a copy of the parent object in case this is referring to the global one (due to object create once, then update)
        parentOptions.color = util.deepExtend({}, parentOptions.color, true);
        if (util.isString(newOptions.color)) {
          parentOptions.color.color = newOptions.color;
          parentOptions.color.highlight = newOptions.color;
          parentOptions.color.hover = newOptions.color;
          parentOptions.color.inherit = false;
        } else {
          var colorsDefined = false;
          if (newOptions.color.color !== undefined) {
            parentOptions.color.color = newOptions.color.color;colorsDefined = true;
          }
          if (newOptions.color.highlight !== undefined) {
            parentOptions.color.highlight = newOptions.color.highlight;colorsDefined = true;
          }
          if (newOptions.color.hover !== undefined) {
            parentOptions.color.hover = newOptions.color.hover;colorsDefined = true;
          }
          if (newOptions.color.inherit !== undefined) {
            parentOptions.color.inherit = newOptions.color.inherit;
          }
          if (newOptions.color.opacity !== undefined) {
            parentOptions.color.opacity = Math.min(1, Math.max(0, newOptions.color.opacity));
          }

          if (newOptions.color.inherit === undefined && colorsDefined === true) {
            parentOptions.color.inherit = false;
          }
        }
      } else if (allowDeletion === true && newOptions.color === null) {
        parentOptions.color = util.bridgeObject(globalOptions.color); // set the object back to the global options
      }

      // handle the font settings
      if (newOptions.font !== undefined && newOptions.font !== null) {
        _sharedLabel2['default'].parseOptions(parentOptions.font, newOptions);
      } else if (allowDeletion === true && newOptions.font === null) {
        parentOptions.font = util.bridgeObject(globalOptions.font);
      }
    }
  }]);

  return Edge;
})();

exports['default'] = Edge;
module.exports = exports['default'];

},{"../../../util":73,"./edges/BezierEdgeDynamic":33,"./edges/BezierEdgeStatic":34,"./edges/CubicBezierEdge":35,"./edges/StraightEdge":36,"./shared/Label":66}],29:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var util = require('../../../util');
var Hammer = require('../../../module/hammer');
var hammerUtil = require('../../../hammerUtil');
var keycharm = require('keycharm');

var NavigationHandler = (function () {
  function NavigationHandler(body, canvas) {
    var _this = this;

    _classCallCheck(this, NavigationHandler);

    this.body = body;
    this.canvas = canvas;

    this.iconsCreated = false;
    this.navigationHammers = [];
    this.boundFunctions = {};
    this.touchTime = 0;
    this.activated = false;

    this.body.emitter.on("activate", function () {
      _this.activated = true;_this.configureKeyboardBindings();
    });
    this.body.emitter.on("deactivate", function () {
      _this.activated = false;_this.configureKeyboardBindings();
    });
    this.body.emitter.on("destroy", function () {
      if (_this.keycharm !== undefined) {
        _this.keycharm.destroy();
      }
    });

    this.options = {};
  }

  _createClass(NavigationHandler, [{
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        this.options = options;
        this.create();
      }
    }
  }, {
    key: 'create',
    value: function create() {
      if (this.options.navigationButtons === true) {
        if (this.iconsCreated === false) {
          this.loadNavigationElements();
        }
      } else if (this.iconsCreated === true) {
        this.cleanNavigation();
      }

      this.configureKeyboardBindings();
    }
  }, {
    key: 'cleanNavigation',
    value: function cleanNavigation() {
      // clean hammer bindings
      if (this.navigationHammers.length != 0) {
        for (var i = 0; i < this.navigationHammers.length; i++) {
          this.navigationHammers[i].destroy();
        }
        this.navigationHammers = [];
      }

      // clean up previous navigation items
      if (this.navigationDOM && this.navigationDOM['wrapper'] && this.navigationDOM['wrapper'].parentNode) {
        this.navigationDOM['wrapper'].parentNode.removeChild(this.navigationDOM['wrapper']);
      }

      this.iconsCreated = false;
    }

    /**
     * Creation of the navigation controls nodes. They are drawn over the rest of the nodes and are not affected by scale and translation
     * they have a triggerFunction which is called on click. If the position of the navigation controls is dependent
     * on this.frame.canvas.clientWidth or this.frame.canvas.clientHeight, we flag horizontalAlignLeft and verticalAlignTop false.
     * This means that the location will be corrected by the _relocateNavigation function on a size change of the canvas.
     *
     * @private
     */
  }, {
    key: 'loadNavigationElements',
    value: function loadNavigationElements() {
      var _this2 = this;

      this.cleanNavigation();

      this.navigationDOM = {};
      var navigationDivs = ['up', 'down', 'left', 'right', 'zoomIn', 'zoomOut', 'zoomExtends'];
      var navigationDivActions = ['_moveUp', '_moveDown', '_moveLeft', '_moveRight', '_zoomIn', '_zoomOut', '_fit'];

      this.navigationDOM['wrapper'] = document.createElement('div');
      this.navigationDOM['wrapper'].className = 'vis-navigation';
      this.canvas.frame.appendChild(this.navigationDOM['wrapper']);

      for (var i = 0; i < navigationDivs.length; i++) {
        this.navigationDOM[navigationDivs[i]] = document.createElement('div');
        this.navigationDOM[navigationDivs[i]].className = 'vis-button vis-' + navigationDivs[i];
        this.navigationDOM['wrapper'].appendChild(this.navigationDOM[navigationDivs[i]]);

        var hammer = new Hammer(this.navigationDOM[navigationDivs[i]]);
        if (navigationDivActions[i] === "_fit") {
          hammerUtil.onTouch(hammer, this._fit.bind(this));
        } else {
          hammerUtil.onTouch(hammer, this.bindToRedraw.bind(this, navigationDivActions[i]));
        }

        this.navigationHammers.push(hammer);
      }

      // use a hammer for the release so we do not require the one used in the rest of the network
      // the one the rest uses can be overloaded by the manipulation system.
      var hammerFrame = new Hammer(this.canvas.frame);
      hammerUtil.onRelease(hammerFrame, function () {
        _this2._stopMovement();
      });
      this.navigationHammers.push(hammerFrame);

      this.iconsCreated = true;
    }
  }, {
    key: 'bindToRedraw',
    value: function bindToRedraw(action) {
      if (this.boundFunctions[action] === undefined) {
        this.boundFunctions[action] = this[action].bind(this);
        this.body.emitter.on("initRedraw", this.boundFunctions[action]);
        this.body.emitter.emit("_startRendering");
      }
    }
  }, {
    key: 'unbindFromRedraw',
    value: function unbindFromRedraw(action) {
      if (this.boundFunctions[action] !== undefined) {
        this.body.emitter.off("initRedraw", this.boundFunctions[action]);
        this.body.emitter.emit("_stopRendering");
        delete this.boundFunctions[action];
      }
    }

    /**
     * this stops all movement induced by the navigation buttons
     *
     * @private
     */
  }, {
    key: '_fit',
    value: function _fit() {
      if (new Date().valueOf() - this.touchTime > 700) {
        // TODO: fix ugly hack to avoid hammer's double fireing of event (because we use release?)
        this.body.emitter.emit("fit", { duration: 700 });
        this.touchTime = new Date().valueOf();
      }
    }

    /**
     * this stops all movement induced by the navigation buttons
     *
     * @private
     */
  }, {
    key: '_stopMovement',
    value: function _stopMovement() {
      for (var boundAction in this.boundFunctions) {
        if (this.boundFunctions.hasOwnProperty(boundAction)) {
          this.body.emitter.off("initRedraw", this.boundFunctions[boundAction]);
          this.body.emitter.emit("_stopRendering");
        }
      }
      this.boundFunctions = {};
    }
  }, {
    key: '_moveUp',
    value: function _moveUp() {
      this.body.view.translation.y += this.options.keyboard.speed.y;
    }
  }, {
    key: '_moveDown',
    value: function _moveDown() {
      this.body.view.translation.y -= this.options.keyboard.speed.y;
    }
  }, {
    key: '_moveLeft',
    value: function _moveLeft() {
      this.body.view.translation.x += this.options.keyboard.speed.x;
    }
  }, {
    key: '_moveRight',
    value: function _moveRight() {
      this.body.view.translation.x -= this.options.keyboard.speed.x;
    }
  }, {
    key: '_zoomIn',
    value: function _zoomIn() {
      this.body.view.scale *= 1 + this.options.keyboard.speed.zoom;
      this.body.emitter.emit('zoom', { direction: '+', scale: this.body.view.scale });
    }
  }, {
    key: '_zoomOut',
    value: function _zoomOut() {
      this.body.view.scale /= 1 + this.options.keyboard.speed.zoom;
      this.body.emitter.emit('zoom', { direction: '-', scale: this.body.view.scale });
    }

    /**
     * bind all keys using keycharm.
     */
  }, {
    key: 'configureKeyboardBindings',
    value: function configureKeyboardBindings() {
      var _this3 = this;

      if (this.keycharm !== undefined) {
        this.keycharm.destroy();
      }

      if (this.options.keyboard.enabled === true) {
        if (this.options.keyboard.bindToWindow === true) {
          this.keycharm = keycharm({ container: window, preventDefault: true });
        } else {
          this.keycharm = keycharm({ container: this.canvas.frame, preventDefault: true });
        }

        this.keycharm.reset();

        if (this.activated === true) {
          this.keycharm.bind("up", function () {
            _this3.bindToRedraw("_moveUp");
          }, "keydown");
          this.keycharm.bind("down", function () {
            _this3.bindToRedraw("_moveDown");
          }, "keydown");
          this.keycharm.bind("left", function () {
            _this3.bindToRedraw("_moveLeft");
          }, "keydown");
          this.keycharm.bind("right", function () {
            _this3.bindToRedraw("_moveRight");
          }, "keydown");
          this.keycharm.bind("=", function () {
            _this3.bindToRedraw("_zoomIn");
          }, "keydown");
          this.keycharm.bind("num+", function () {
            _this3.bindToRedraw("_zoomIn");
          }, "keydown");
          this.keycharm.bind("num-", function () {
            _this3.bindToRedraw("_zoomOut");
          }, "keydown");
          this.keycharm.bind("-", function () {
            _this3.bindToRedraw("_zoomOut");
          }, "keydown");
          this.keycharm.bind("[", function () {
            _this3.bindToRedraw("_zoomOut");
          }, "keydown");
          this.keycharm.bind("]", function () {
            _this3.bindToRedraw("_zoomIn");
          }, "keydown");
          this.keycharm.bind("pageup", function () {
            _this3.bindToRedraw("_zoomIn");
          }, "keydown");
          this.keycharm.bind("pagedown", function () {
            _this3.bindToRedraw("_zoomOut");
          }, "keydown");

          this.keycharm.bind("up", function () {
            _this3.unbindFromRedraw("_moveUp");
          }, "keyup");
          this.keycharm.bind("down", function () {
            _this3.unbindFromRedraw("_moveDown");
          }, "keyup");
          this.keycharm.bind("left", function () {
            _this3.unbindFromRedraw("_moveLeft");
          }, "keyup");
          this.keycharm.bind("right", function () {
            _this3.unbindFromRedraw("_moveRight");
          }, "keyup");
          this.keycharm.bind("=", function () {
            _this3.unbindFromRedraw("_zoomIn");
          }, "keyup");
          this.keycharm.bind("num+", function () {
            _this3.unbindFromRedraw("_zoomIn");
          }, "keyup");
          this.keycharm.bind("num-", function () {
            _this3.unbindFromRedraw("_zoomOut");
          }, "keyup");
          this.keycharm.bind("-", function () {
            _this3.unbindFromRedraw("_zoomOut");
          }, "keyup");
          this.keycharm.bind("[", function () {
            _this3.unbindFromRedraw("_zoomOut");
          }, "keyup");
          this.keycharm.bind("]", function () {
            _this3.unbindFromRedraw("_zoomIn");
          }, "keyup");
          this.keycharm.bind("pageup", function () {
            _this3.unbindFromRedraw("_zoomIn");
          }, "keyup");
          this.keycharm.bind("pagedown", function () {
            _this3.unbindFromRedraw("_zoomOut");
          }, "keyup");
        }
      }
    }
  }]);

  return NavigationHandler;
})();

exports['default'] = NavigationHandler;
module.exports = exports['default'];

},{"../../../hammerUtil":5,"../../../module/hammer":6,"../../../util":73,"keycharm":76}],30:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _sharedLabel = require('./shared/Label');

var _sharedLabel2 = _interopRequireDefault(_sharedLabel);

var _nodesShapesBox = require('./nodes/shapes/Box');

var _nodesShapesBox2 = _interopRequireDefault(_nodesShapesBox);

var _nodesShapesCircle = require('./nodes/shapes/Circle');

var _nodesShapesCircle2 = _interopRequireDefault(_nodesShapesCircle);

var _nodesShapesCircularImage = require('./nodes/shapes/CircularImage');

var _nodesShapesCircularImage2 = _interopRequireDefault(_nodesShapesCircularImage);

var _nodesShapesDatabase = require('./nodes/shapes/Database');

var _nodesShapesDatabase2 = _interopRequireDefault(_nodesShapesDatabase);

var _nodesShapesDiamond = require('./nodes/shapes/Diamond');

var _nodesShapesDiamond2 = _interopRequireDefault(_nodesShapesDiamond);

var _nodesShapesDot = require('./nodes/shapes/Dot');

var _nodesShapesDot2 = _interopRequireDefault(_nodesShapesDot);

var _nodesShapesEllipse = require('./nodes/shapes/Ellipse');

var _nodesShapesEllipse2 = _interopRequireDefault(_nodesShapesEllipse);

var _nodesShapesIcon = require('./nodes/shapes/Icon');

var _nodesShapesIcon2 = _interopRequireDefault(_nodesShapesIcon);

var _nodesShapesImage = require('./nodes/shapes/Image');

var _nodesShapesImage2 = _interopRequireDefault(_nodesShapesImage);

var _nodesShapesSquare = require('./nodes/shapes/Square');

var _nodesShapesSquare2 = _interopRequireDefault(_nodesShapesSquare);

var _nodesShapesStar = require('./nodes/shapes/Star');

var _nodesShapesStar2 = _interopRequireDefault(_nodesShapesStar);

var _nodesShapesText = require('./nodes/shapes/Text');

var _nodesShapesText2 = _interopRequireDefault(_nodesShapesText);

var _nodesShapesTriangle = require('./nodes/shapes/Triangle');

var _nodesShapesTriangle2 = _interopRequireDefault(_nodesShapesTriangle);

var _nodesShapesTriangleDown = require('./nodes/shapes/TriangleDown');

var _nodesShapesTriangleDown2 = _interopRequireDefault(_nodesShapesTriangleDown);

var _sharedValidator = require("../../../shared/Validator");

var _sharedValidator2 = _interopRequireDefault(_sharedValidator);

var util = require('../../../util');

/**
 * @class Node
 * A node. A node can be connected to other nodes via one or multiple edges.
 * @param {object} options An object containing options for the node. All
 *                            options are optional, except for the id.
 *                              {number} id     Id of the node. Required
 *                              {string} label  Text label for the node
 *                              {number} x      Horizontal position of the node
 *                              {number} y      Vertical position of the node
 *                              {string} shape  Node shape, available:
 *                                              "database", "circle", "ellipse",
 *                                              "box", "image", "text", "dot",
 *                                              "star", "triangle", "triangleDown",
 *                                              "square", "icon"
 *                              {string} image  An image url
 *                              {string} title  An title text, can be HTML
 *                              {anytype} group A group name or number
 * @param {Network.Images} imagelist    A list with images. Only needed
 *                                            when the node has an image
 * @param {Network.Groups} grouplist    A list with groups. Needed for
 *                                            retrieving group options
 * @param {Object}               constants    An object with default values for
 *                                            example for the color
 *
 */

var Node = (function () {
  function Node(options, body, imagelist, grouplist, globalOptions) {
    _classCallCheck(this, Node);

    this.options = util.bridgeObject(globalOptions);
    this.globalOptions = globalOptions;
    this.body = body;

    this.edges = []; // all edges connected to this node

    // set defaults for the options
    this.id = undefined;
    this.imagelist = imagelist;
    this.grouplist = grouplist;

    // state options
    this.x = undefined;
    this.y = undefined;
    this.baseSize = this.options.size;
    this.baseFontSize = this.options.font.size;
    this.predefinedPosition = false; // used to check if initial fit should just take the range or approximate
    this.selected = false;
    this.hover = false;

    this.labelModule = new _sharedLabel2['default'](this.body, this.options);
    this.setOptions(options);
  }

  /**
   * Attach a edge to the node
   * @param {Edge} edge
   */

  _createClass(Node, [{
    key: 'attachEdge',
    value: function attachEdge(edge) {
      if (this.edges.indexOf(edge) === -1) {
        this.edges.push(edge);
      }
    }

    /**
     * Detach a edge from the node
     * @param {Edge} edge
     */
  }, {
    key: 'detachEdge',
    value: function detachEdge(edge) {
      var index = this.edges.indexOf(edge);
      if (index != -1) {
        this.edges.splice(index, 1);
      }
    }

    /**
     * Set or overwrite options for the node
     * @param {Object} options an object with options
     * @param {Object} constants  and object with default, global options
     */
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      var currentShape = this.options.shape;
      if (!options) {
        return;
      }
      // basic options
      if (options.id !== undefined) {
        this.id = options.id;
      }

      if (this.id === undefined) {
        throw "Node must have an id";
      }

      // set these options locally
      // clear x and y positions
      if (options.x !== undefined) {
        if (options.x === null) {
          this.x = undefined;this.predefinedPosition = false;
        } else {
          this.x = parseInt(options.x);this.predefinedPosition = true;
        }
      }
      if (options.y !== undefined) {
        if (options.y === null) {
          this.y = undefined;this.predefinedPosition = false;
        } else {
          this.y = parseInt(options.y);this.predefinedPosition = true;
        }
      }
      if (options.size !== undefined) {
        this.baseSize = options.size;
      }
      if (options.value !== undefined) {
        options.value = parseFloat(options.value);
      }

      // copy group options
      if (typeof options.group === 'number' || typeof options.group === 'string' && options.group != '') {
        var groupObj = this.grouplist.get(options.group);
        util.deepExtend(this.options, groupObj);
        // the color object needs to be completely defined. Since groups can partially overwrite the colors, we parse it again, just in case.
        this.options.color = util.parseColor(this.options.color);
      }

      // this transforms all shorthands into fully defined options
      Node.parseOptions(this.options, options, true, this.globalOptions);

      // load the images
      if (this.options.image !== undefined) {
        if (this.imagelist) {
          this.imageObj = this.imagelist.load(this.options.image, this.options.brokenImage, this.id);
        } else {
          throw "No imagelist provided";
        }
      }

      this.updateLabelModule();
      this.updateShape(currentShape);

      if (options.hidden !== undefined || options.physics !== undefined) {
        return true;
      }
      return false;
    }

    /**
     * This process all possible shorthands in the new options and makes sure that the parentOptions are fully defined.
     * Static so it can also be used by the handler.
     * @param parentOptions
     * @param newOptions
     */
  }, {
    key: 'updateLabelModule',
    value: function updateLabelModule() {
      if (this.options.label === undefined || this.options.label === null) {
        this.options.label = '';
      }
      this.labelModule.setOptions(this.options, true);
      if (this.labelModule.baseSize !== undefined) {
        this.baseFontSize = this.labelModule.baseSize;
      }
    }
  }, {
    key: 'updateShape',
    value: function updateShape(currentShape) {
      if (currentShape === this.options.shape && this.shape) {
        this.shape.setOptions(this.options, this.imageObj);
      } else {
        // choose draw method depending on the shape
        switch (this.options.shape) {
          case 'box':
            this.shape = new _nodesShapesBox2['default'](this.options, this.body, this.labelModule);
            break;
          case 'circle':
            this.shape = new _nodesShapesCircle2['default'](this.options, this.body, this.labelModule);
            break;
          case 'circularImage':
            this.shape = new _nodesShapesCircularImage2['default'](this.options, this.body, this.labelModule, this.imageObj);
            break;
          case 'database':
            this.shape = new _nodesShapesDatabase2['default'](this.options, this.body, this.labelModule);
            break;
          case 'diamond':
            this.shape = new _nodesShapesDiamond2['default'](this.options, this.body, this.labelModule);
            break;
          case 'dot':
            this.shape = new _nodesShapesDot2['default'](this.options, this.body, this.labelModule);
            break;
          case 'ellipse':
            this.shape = new _nodesShapesEllipse2['default'](this.options, this.body, this.labelModule);
            break;
          case 'icon':
            this.shape = new _nodesShapesIcon2['default'](this.options, this.body, this.labelModule);
            break;
          case 'image':
            this.shape = new _nodesShapesImage2['default'](this.options, this.body, this.labelModule, this.imageObj);
            break;
          case 'square':
            this.shape = new _nodesShapesSquare2['default'](this.options, this.body, this.labelModule);
            break;
          case 'star':
            this.shape = new _nodesShapesStar2['default'](this.options, this.body, this.labelModule);
            break;
          case 'text':
            this.shape = new _nodesShapesText2['default'](this.options, this.body, this.labelModule);
            break;
          case 'triangle':
            this.shape = new _nodesShapesTriangle2['default'](this.options, this.body, this.labelModule);
            break;
          case 'triangleDown':
            this.shape = new _nodesShapesTriangleDown2['default'](this.options, this.body, this.labelModule);
            break;
          default:
            this.shape = new _nodesShapesEllipse2['default'](this.options, this.body, this.labelModule);
            break;
        }
      }
      this._reset();
    }

    /**
     * select this node
     */
  }, {
    key: 'select',
    value: function select() {
      this.selected = true;
      this._reset();
    }

    /**
     * unselect this node
     */
  }, {
    key: 'unselect',
    value: function unselect() {
      this.selected = false;
      this._reset();
    }

    /**
     * Reset the calculated size of the node, forces it to recalculate its size
     * @private
     */
  }, {
    key: '_reset',
    value: function _reset() {
      this.shape.width = undefined;
      this.shape.height = undefined;
    }

    /**
     * get the title of this node.
     * @return {string} title    The title of the node, or undefined when no title
     *                           has been set.
     */
  }, {
    key: 'getTitle',
    value: function getTitle() {
      return this.options.title;
    }

    /**
     * Calculate the distance to the border of the Node
     * @param {CanvasRenderingContext2D}   ctx
     * @param {Number} angle        Angle in radians
     * @returns {number} distance   Distance to the border in pixels
     */
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this.shape.distanceToBorder(ctx, angle);
    }

    /**
     * Check if this node has a fixed x and y position
     * @return {boolean}      true if fixed, false if not
     */
  }, {
    key: 'isFixed',
    value: function isFixed() {
      return this.options.fixed.x && this.options.fixed.y;
    }

    /**
     * check if this node is selecte
     * @return {boolean} selected   True if node is selected, else false
     */
  }, {
    key: 'isSelected',
    value: function isSelected() {
      return this.selected;
    }

    /**
     * Retrieve the value of the node. Can be undefined
     * @return {Number} value
     */
  }, {
    key: 'getValue',
    value: function getValue() {
      return this.options.value;
    }

    /**
     * Adjust the value range of the node. The node will adjust it's size
     * based on its value.
     * @param {Number} min
     * @param {Number} max
     */
  }, {
    key: 'setValueRange',
    value: function setValueRange(min, max, total) {
      if (this.options.value !== undefined) {
        var scale = this.options.scaling.customScalingFunction(min, max, total, this.options.value);
        var sizeDiff = this.options.scaling.max - this.options.scaling.min;
        if (this.options.scaling.label.enabled === true) {
          var fontDiff = this.options.scaling.label.max - this.options.scaling.label.min;
          this.options.font.size = this.options.scaling.label.min + scale * fontDiff;
        }
        this.options.size = this.options.scaling.min + scale * sizeDiff;
      } else {
        this.options.size = this.baseSize;
        this.options.font.size = this.baseFontSize;
      }

      this.updateLabelModule();
    }

    /**
     * Draw this node in the given canvas
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
     * @param {CanvasRenderingContext2D}   ctx
     */
  }, {
    key: 'draw',
    value: function draw(ctx) {
      this.shape.draw(ctx, this.x, this.y, this.selected, this.hover);
    }

    /**
     * Update the bounding box of the shape
     */
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(ctx) {
      this.shape.updateBoundingBox(this.x, this.y, ctx);
    }

    /**
     * Recalculate the size of this node in the given canvas
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
     * @param {CanvasRenderingContext2D}   ctx
     */
  }, {
    key: 'resize',
    value: function resize(ctx) {
      this.shape.resize(ctx, this.selected);
    }

    /**
     * Check if this object is overlapping with the provided object
     * @param {Object} obj   an object with parameters left, top, right, bottom
     * @return {boolean}     True if location is located on node
     */
  }, {
    key: 'isOverlappingWith',
    value: function isOverlappingWith(obj) {
      return this.shape.left < obj.right && this.shape.left + this.shape.width > obj.left && this.shape.top < obj.bottom && this.shape.top + this.shape.height > obj.top;
    }

    /**
     * Check if this object is overlapping with the provided object
     * @param {Object} obj   an object with parameters left, top, right, bottom
     * @return {boolean}     True if location is located on node
     */
  }, {
    key: 'isBoundingBoxOverlappingWith',
    value: function isBoundingBoxOverlappingWith(obj) {
      return this.shape.boundingBox.left < obj.right && this.shape.boundingBox.right > obj.left && this.shape.boundingBox.top < obj.bottom && this.shape.boundingBox.bottom > obj.top;
    }
  }], [{
    key: 'parseOptions',
    value: function parseOptions(parentOptions, newOptions) {
      var allowDeletion = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];
      var globalOptions = arguments.length <= 3 || arguments[3] === undefined ? {} : arguments[3];

      var fields = ['color', 'font', 'fixed', 'shadow'];
      util.selectiveNotDeepExtend(fields, parentOptions, newOptions, allowDeletion);

      // merge the shadow options into the parent.
      util.mergeOptions(parentOptions, newOptions, 'shadow', allowDeletion, globalOptions);

      // individual shape newOptions
      if (newOptions.color !== undefined && newOptions.color !== null) {
        var parsedColor = util.parseColor(newOptions.color);
        util.fillIfDefined(parentOptions.color, parsedColor);
      } else if (allowDeletion === true && newOptions.color === null) {
        parentOptions.color = util.bridgeObject(globalOptions.color); // set the object back to the global options
      }

      // handle the fixed options
      if (newOptions.fixed !== undefined && newOptions.fixed !== null) {
        if (typeof newOptions.fixed === 'boolean') {
          parentOptions.fixed.x = newOptions.fixed;
          parentOptions.fixed.y = newOptions.fixed;
        } else {
          if (newOptions.fixed.x !== undefined && typeof newOptions.fixed.x === 'boolean') {
            parentOptions.fixed.x = newOptions.fixed.x;
          }
          if (newOptions.fixed.y !== undefined && typeof newOptions.fixed.y === 'boolean') {
            parentOptions.fixed.y = newOptions.fixed.y;
          }
        }
      }

      // handle the font options
      if (newOptions.font !== undefined && newOptions.font !== null) {
        _sharedLabel2['default'].parseOptions(parentOptions.font, newOptions);
      } else if (allowDeletion === true && newOptions.font === null) {
        parentOptions.font = util.bridgeObject(globalOptions.font); // set the object back to the global options
      }

      // handle the scaling options, specifically the label part
      if (newOptions.scaling !== undefined) {
        util.mergeOptions(parentOptions.scaling, newOptions.scaling, 'label', allowDeletion, globalOptions.scaling);
      }
    }
  }]);

  return Node;
})();

exports['default'] = Node;
module.exports = exports['default'];

},{"../../../shared/Validator":72,"../../../util":73,"./nodes/shapes/Box":41,"./nodes/shapes/Circle":42,"./nodes/shapes/CircularImage":43,"./nodes/shapes/Database":44,"./nodes/shapes/Diamond":45,"./nodes/shapes/Dot":46,"./nodes/shapes/Ellipse":47,"./nodes/shapes/Icon":48,"./nodes/shapes/Image":49,"./nodes/shapes/Square":50,"./nodes/shapes/Star":51,"./nodes/shapes/Text":52,"./nodes/shapes/Triangle":53,"./nodes/shapes/TriangleDown":54,"./shared/Label":66}],31:[function(require,module,exports){
/**
 * Popup is a class to create a popup window with some text
 * @param {Element}  container     The container object.
 * @param {Number} [x]
 * @param {Number} [y]
 * @param {String} [text]
 * @param {Object} [style]     An object containing borderColor,
 *                             backgroundColor, etc.
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Popup = (function () {
  function Popup(container) {
    _classCallCheck(this, Popup);

    this.container = container;

    this.x = 0;
    this.y = 0;
    this.padding = 5;
    this.hidden = false;

    // create the frame
    this.frame = document.createElement('div');
    this.frame.className = 'vis-network-tooltip';
    this.container.appendChild(this.frame);
  }

  /**
   * @param {number} x   Horizontal position of the popup window
   * @param {number} y   Vertical position of the popup window
   */

  _createClass(Popup, [{
    key: 'setPosition',
    value: function setPosition(x, y) {
      this.x = parseInt(x);
      this.y = parseInt(y);
    }

    /**
     * Set the content for the popup window. This can be HTML code or text.
     * @param {string | Element} content
     */
  }, {
    key: 'setText',
    value: function setText(content) {
      if (content instanceof Element) {
        this.frame.innerHTML = '';
        this.frame.appendChild(content);
      } else {
        this.frame.innerHTML = content; // string containing text or HTML
      }
    }

    /**
     * Show the popup window
     * @param {boolean} [doShow]    Show or hide the window
     */
  }, {
    key: 'show',
    value: function show(doShow) {
      if (doShow === undefined) {
        doShow = true;
      }

      if (doShow === true) {
        var height = this.frame.clientHeight;
        var width = this.frame.clientWidth;
        var maxHeight = this.frame.parentNode.clientHeight;
        var maxWidth = this.frame.parentNode.clientWidth;

        var top = this.y - height;
        if (top + height + this.padding > maxHeight) {
          top = maxHeight - height - this.padding;
        }
        if (top < this.padding) {
          top = this.padding;
        }

        var left = this.x;
        if (left + width + this.padding > maxWidth) {
          left = maxWidth - width - this.padding;
        }
        if (left < this.padding) {
          left = this.padding;
        }

        this.frame.style.left = left + "px";
        this.frame.style.top = top + "px";
        this.frame.style.visibility = "visible";
        this.hidden = false;
      } else {
        this.hide();
      }
    }

    /**
     * Hide the popup window
     */
  }, {
    key: 'hide',
    value: function hide() {
      this.hidden = true;
      this.frame.style.visibility = "hidden";
    }
  }]);

  return Popup;
})();

exports['default'] = Popup;
module.exports = exports['default'];

},{}],32:[function(require,module,exports){
/**
 * Created by Alex on 10-Aug-15.
 */

"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var FloydWarshall = (function () {
  function FloydWarshall() {
    _classCallCheck(this, FloydWarshall);
  }

  _createClass(FloydWarshall, [{
    key: "getDistances",
    value: function getDistances(body, nodesArray, edgesArray) {
      var D_matrix = {};
      var edges = body.edges;

      // prepare matrix with large numbers
      for (var i = 0; i < nodesArray.length; i++) {
        D_matrix[nodesArray[i]] = {};
        D_matrix[nodesArray[i]] = {};
        for (var j = 0; j < nodesArray.length; j++) {
          D_matrix[nodesArray[i]][nodesArray[j]] = i == j ? 0 : 1e9;
          D_matrix[nodesArray[i]][nodesArray[j]] = i == j ? 0 : 1e9;
        }
      }

      // put the weights for the edges in. This assumes unidirectionality.
      for (var i = 0; i < edgesArray.length; i++) {
        var edge = edges[edgesArray[i]];
        // edge has to be connected if it counts to the distances. If it is connected to inner clusters it will crash so we also check if it is in the D_matrix
        if (edge.connected === true && D_matrix[edge.fromId] !== undefined && D_matrix[edge.toId] !== undefined) {
          D_matrix[edge.fromId][edge.toId] = 1;
          D_matrix[edge.toId][edge.fromId] = 1;
        }
      }

      var nodeCount = nodesArray.length;

      // Adapted FloydWarshall based on unidirectionality to greatly reduce complexity.
      for (var k = 0; k < nodeCount; k++) {
        for (var i = 0; i < nodeCount - 1; i++) {
          for (var j = i + 1; j < nodeCount; j++) {
            D_matrix[nodesArray[i]][nodesArray[j]] = Math.min(D_matrix[nodesArray[i]][nodesArray[j]], D_matrix[nodesArray[i]][nodesArray[k]] + D_matrix[nodesArray[k]][nodesArray[j]]);
            D_matrix[nodesArray[j]][nodesArray[i]] = D_matrix[nodesArray[i]][nodesArray[j]];
          }
        }
      }

      return D_matrix;
    }
  }]);

  return FloydWarshall;
})();

exports["default"] = FloydWarshall;
module.exports = exports["default"];

},{}],33:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilBezierEdgeBase = require('./util/BezierEdgeBase');

var _utilBezierEdgeBase2 = _interopRequireDefault(_utilBezierEdgeBase);

var BezierEdgeDynamic = (function (_BezierEdgeBase) {
  _inherits(BezierEdgeDynamic, _BezierEdgeBase);

  function BezierEdgeDynamic(options, body, labelModule) {
    var _this = this;

    _classCallCheck(this, BezierEdgeDynamic);

    //this.via = undefined; // Here for completeness but not allowed to defined before super() is invoked.
    _get(Object.getPrototypeOf(BezierEdgeDynamic.prototype), "constructor", this).call(this, options, body, labelModule); // --> this calls the setOptions below
    this._boundFunction = function () {
      _this.positionBezierNode();
    };
    this.body.emitter.on("_repositionBezierNodes", this._boundFunction);
  }

  _createClass(BezierEdgeDynamic, [{
    key: "setOptions",
    value: function setOptions(options) {
      // check if the physics has changed.
      var physicsChange = false;
      if (this.options.physics !== options.physics) {
        physicsChange = true;
      }

      // set the options and the to and from nodes
      this.options = options;
      this.id = this.options.id;
      this.from = this.body.nodes[this.options.from];
      this.to = this.body.nodes[this.options.to];

      // setup the support node and connect
      this.setupSupportNode();
      this.connect();

      // when we change the physics state of the edge, we reposition the support node.
      if (physicsChange === true) {
        this.via.setOptions({ physics: this.options.physics });
        this.positionBezierNode();
      }
    }
  }, {
    key: "connect",
    value: function connect() {
      this.from = this.body.nodes[this.options.from];
      this.to = this.body.nodes[this.options.to];
      if (this.from === undefined || this.to === undefined || this.options.physics === false) {
        this.via.setOptions({ physics: false });
      } else {
        // fix weird behaviour where a selfreferencing node has physics enabled
        if (this.from.id === this.to.id) {
          this.via.setOptions({ physics: false });
        } else {
          this.via.setOptions({ physics: true });
        }
      }
    }

    /**
     * remove the support nodes
     * @returns {boolean}
     */
  }, {
    key: "cleanup",
    value: function cleanup() {
      this.body.emitter.off("_repositionBezierNodes", this._boundFunction);
      if (this.via !== undefined) {
        delete this.body.nodes[this.via.id];
        this.via = undefined;
        return true;
      }
      return false;
    }

    /**
     * Bezier curves require an anchor point to calculate the smooth flow. These points are nodes. These nodes are invisible but
     * are used for the force calculation.
     *
     * The changed data is not called, if needed, it is returned by the main edge constructor.
     * @private
     */
  }, {
    key: "setupSupportNode",
    value: function setupSupportNode() {
      if (this.via === undefined) {
        var nodeId = "edgeId:" + this.id;
        var node = this.body.functions.createNode({
          id: nodeId,
          shape: 'circle',
          physics: true,
          hidden: true
        });
        this.body.nodes[nodeId] = node;
        this.via = node;
        this.via.parentEdgeId = this.id;
        this.positionBezierNode();
      }
    }
  }, {
    key: "positionBezierNode",
    value: function positionBezierNode() {
      if (this.via !== undefined && this.from !== undefined && this.to !== undefined) {
        this.via.x = 0.5 * (this.from.x + this.to.x);
        this.via.y = 0.5 * (this.from.y + this.to.y);
      } else if (this.via !== undefined) {
        this.via.x = 0;
        this.via.y = 0;
      }
    }

    /**
     * Draw a line between two nodes
     * @param {CanvasRenderingContext2D} ctx
     * @private
     */
  }, {
    key: "_line",
    value: function _line(ctx) {
      // draw a straight line
      ctx.beginPath();
      ctx.moveTo(this.from.x, this.from.y);
      ctx.quadraticCurveTo(this.via.x, this.via.y, this.to.x, this.to.y);
      // draw shadow if enabled
      this.enableShadow(ctx);
      ctx.stroke();
      this.disableShadow(ctx);
      return this.via;
    }

    /**
     * Combined function of pointOnLine and pointOnBezier. This gives the coordinates of a point on the line at a certain percentage of the way
     * @param percentage
     * @param via
     * @returns {{x: number, y: number}}
     * @private
     */
  }, {
    key: "getPoint",
    value: function getPoint(percentage) {
      var t = percentage;
      var x = Math.pow(1 - t, 2) * this.from.x + 2 * t * (1 - t) * this.via.x + Math.pow(t, 2) * this.to.x;
      var y = Math.pow(1 - t, 2) * this.from.y + 2 * t * (1 - t) * this.via.y + Math.pow(t, 2) * this.to.y;

      return { x: x, y: y };
    }
  }, {
    key: "_findBorderPosition",
    value: function _findBorderPosition(nearNode, ctx) {
      return this._findBorderPositionBezier(nearNode, ctx, this.via);
    }
  }, {
    key: "_getDistanceToEdge",
    value: function _getDistanceToEdge(x1, y1, x2, y2, x3, y3) {
      // x3,y3 is the point
      return this._getDistanceToBezierEdge(x1, y1, x2, y2, x3, y3, this.via);
    }
  }]);

  return BezierEdgeDynamic;
})(_utilBezierEdgeBase2["default"]);

exports["default"] = BezierEdgeDynamic;
module.exports = exports["default"];

},{"./util/BezierEdgeBase":37}],34:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x4, _x5, _x6) { var _again = true; _function: while (_again) { var object = _x4, property = _x5, receiver = _x6; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x4 = parent; _x5 = property; _x6 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilBezierEdgeBase = require('./util/BezierEdgeBase');

var _utilBezierEdgeBase2 = _interopRequireDefault(_utilBezierEdgeBase);

var BezierEdgeStatic = (function (_BezierEdgeBase) {
  _inherits(BezierEdgeStatic, _BezierEdgeBase);

  function BezierEdgeStatic(options, body, labelModule) {
    _classCallCheck(this, BezierEdgeStatic);

    _get(Object.getPrototypeOf(BezierEdgeStatic.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  /**
   * Draw a line between two nodes
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */

  _createClass(BezierEdgeStatic, [{
    key: '_line',
    value: function _line(ctx) {
      // draw a straight line
      ctx.beginPath();
      ctx.moveTo(this.from.x, this.from.y);
      var via = this._getViaCoordinates();
      var returnValue = via;

      // fallback to normal straight edges
      if (via.x === undefined) {
        ctx.lineTo(this.to.x, this.to.y);
        returnValue = undefined;
      } else {
        ctx.quadraticCurveTo(via.x, via.y, this.to.x, this.to.y);
      }
      // draw shadow if enabled
      this.enableShadow(ctx);
      ctx.stroke();
      this.disableShadow(ctx);
      return returnValue;
    }
  }, {
    key: '_getViaCoordinates',
    value: function _getViaCoordinates() {
      var xVia = undefined;
      var yVia = undefined;
      var factor = this.options.smooth.roundness;
      var type = this.options.smooth.type;
      var dx = Math.abs(this.from.x - this.to.x);
      var dy = Math.abs(this.from.y - this.to.y);
      if (type === 'discrete' || type === 'diagonalCross') {
        if (Math.abs(this.from.x - this.to.x) <= Math.abs(this.from.y - this.to.y)) {
          if (this.from.y >= this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dy;
              yVia = this.from.y - factor * dy;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dy;
              yVia = this.from.y - factor * dy;
            }
          } else if (this.from.y < this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dy;
              yVia = this.from.y + factor * dy;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dy;
              yVia = this.from.y + factor * dy;
            }
          }
          if (type === "discrete") {
            xVia = dx < factor * dy ? this.from.x : xVia;
          }
        } else if (Math.abs(this.from.x - this.to.x) > Math.abs(this.from.y - this.to.y)) {
          if (this.from.y >= this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dx;
              yVia = this.from.y - factor * dx;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dx;
              yVia = this.from.y - factor * dx;
            }
          } else if (this.from.y < this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dx;
              yVia = this.from.y + factor * dx;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dx;
              yVia = this.from.y + factor * dx;
            }
          }
          if (type === "discrete") {
            yVia = dy < factor * dx ? this.from.y : yVia;
          }
        }
      } else if (type === "straightCross") {
        if (Math.abs(this.from.x - this.to.x) <= Math.abs(this.from.y - this.to.y)) {
          // up - down
          xVia = this.from.x;
          if (this.from.y < this.to.y) {
            yVia = this.to.y - (1 - factor) * dy;
          } else {
            yVia = this.to.y + (1 - factor) * dy;
          }
        } else if (Math.abs(this.from.x - this.to.x) > Math.abs(this.from.y - this.to.y)) {
          // left - right
          if (this.from.x < this.to.x) {
            xVia = this.to.x - (1 - factor) * dx;
          } else {
            xVia = this.to.x + (1 - factor) * dx;
          }
          yVia = this.from.y;
        }
      } else if (type === 'horizontal') {
        if (this.from.x < this.to.x) {
          xVia = this.to.x - (1 - factor) * dx;
        } else {
          xVia = this.to.x + (1 - factor) * dx;
        }
        yVia = this.from.y;
      } else if (type === 'vertical') {
        xVia = this.from.x;
        if (this.from.y < this.to.y) {
          yVia = this.to.y - (1 - factor) * dy;
        } else {
          yVia = this.to.y + (1 - factor) * dy;
        }
      } else if (type === 'curvedCW') {
        dx = this.to.x - this.from.x;
        dy = this.from.y - this.to.y;
        var radius = Math.sqrt(dx * dx + dy * dy);
        var pi = Math.PI;

        var originalAngle = Math.atan2(dy, dx);
        var myAngle = (originalAngle + (factor * 0.5 + 0.5) * pi) % (2 * pi);

        xVia = this.from.x + (factor * 0.5 + 0.5) * radius * Math.sin(myAngle);
        yVia = this.from.y + (factor * 0.5 + 0.5) * radius * Math.cos(myAngle);
      } else if (type === 'curvedCCW') {
        dx = this.to.x - this.from.x;
        dy = this.from.y - this.to.y;
        var radius = Math.sqrt(dx * dx + dy * dy);
        var pi = Math.PI;

        var originalAngle = Math.atan2(dy, dx);
        var myAngle = (originalAngle + (-factor * 0.5 + 0.5) * pi) % (2 * pi);

        xVia = this.from.x + (factor * 0.5 + 0.5) * radius * Math.sin(myAngle);
        yVia = this.from.y + (factor * 0.5 + 0.5) * radius * Math.cos(myAngle);
      } else {
        // continuous
        if (Math.abs(this.from.x - this.to.x) <= Math.abs(this.from.y - this.to.y)) {
          if (this.from.y >= this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dy;
              yVia = this.from.y - factor * dy;
              xVia = this.to.x < xVia ? this.to.x : xVia;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dy;
              yVia = this.from.y - factor * dy;
              xVia = this.to.x > xVia ? this.to.x : xVia;
            }
          } else if (this.from.y < this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dy;
              yVia = this.from.y + factor * dy;
              xVia = this.to.x < xVia ? this.to.x : xVia;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dy;
              yVia = this.from.y + factor * dy;
              xVia = this.to.x > xVia ? this.to.x : xVia;
            }
          }
        } else if (Math.abs(this.from.x - this.to.x) > Math.abs(this.from.y - this.to.y)) {
          if (this.from.y >= this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dx;
              yVia = this.from.y - factor * dx;
              yVia = this.to.y > yVia ? this.to.y : yVia;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dx;
              yVia = this.from.y - factor * dx;
              yVia = this.to.y > yVia ? this.to.y : yVia;
            }
          } else if (this.from.y < this.to.y) {
            if (this.from.x <= this.to.x) {
              xVia = this.from.x + factor * dx;
              yVia = this.from.y + factor * dx;
              yVia = this.to.y < yVia ? this.to.y : yVia;
            } else if (this.from.x > this.to.x) {
              xVia = this.from.x - factor * dx;
              yVia = this.from.y + factor * dx;
              yVia = this.to.y < yVia ? this.to.y : yVia;
            }
          }
        }
      }
      return { x: xVia, y: yVia };
    }
  }, {
    key: '_findBorderPosition',
    value: function _findBorderPosition(nearNode, ctx) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      return this._findBorderPositionBezier(nearNode, ctx, options.via);
    }
  }, {
    key: '_getDistanceToEdge',
    value: function _getDistanceToEdge(x1, y1, x2, y2, x3, y3) {
      var via = arguments.length <= 6 || arguments[6] === undefined ? this._getViaCoordinates() : arguments[6];
      // x3,y3 is the point
      return this._getDistanceToBezierEdge(x1, y1, x2, y2, x3, y3, via);
    }

    /**
     * Combined function of pointOnLine and pointOnBezier. This gives the coordinates of a point on the line at a certain percentage of the way
     * @param percentage
     * @param via
     * @returns {{x: number, y: number}}
     * @private
     */
  }, {
    key: 'getPoint',
    value: function getPoint(percentage) {
      var via = arguments.length <= 1 || arguments[1] === undefined ? this._getViaCoordinates() : arguments[1];

      var t = percentage;
      var x = Math.pow(1 - t, 2) * this.from.x + 2 * t * (1 - t) * via.x + Math.pow(t, 2) * this.to.x;
      var y = Math.pow(1 - t, 2) * this.from.y + 2 * t * (1 - t) * via.y + Math.pow(t, 2) * this.to.y;

      return { x: x, y: y };
    }
  }]);

  return BezierEdgeStatic;
})(_utilBezierEdgeBase2['default']);

exports['default'] = BezierEdgeStatic;
module.exports = exports['default'];

},{"./util/BezierEdgeBase":37}],35:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x3, _x4, _x5) { var _again = true; _function: while (_again) { var object = _x3, property = _x4, receiver = _x5; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x3 = parent; _x4 = property; _x5 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilCubicBezierEdgeBase = require('./util/CubicBezierEdgeBase');

var _utilCubicBezierEdgeBase2 = _interopRequireDefault(_utilCubicBezierEdgeBase);

var CubicBezierEdge = (function (_CubicBezierEdgeBase) {
  _inherits(CubicBezierEdge, _CubicBezierEdgeBase);

  function CubicBezierEdge(options, body, labelModule) {
    _classCallCheck(this, CubicBezierEdge);

    _get(Object.getPrototypeOf(CubicBezierEdge.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  /**
   * Draw a line between two nodes
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */

  _createClass(CubicBezierEdge, [{
    key: '_line',
    value: function _line(ctx) {
      // get the coordinates of the support points.

      var _getViaCoordinates2 = this._getViaCoordinates();

      var _getViaCoordinates22 = _slicedToArray(_getViaCoordinates2, 2);

      var via1 = _getViaCoordinates22[0];
      var via2 = _getViaCoordinates22[1];

      var returnValue = [via1, via2];

      // start drawing the line.
      ctx.beginPath();
      ctx.moveTo(this.from.x, this.from.y);

      // fallback to normal straight edges
      if (via1.x === undefined) {
        ctx.lineTo(this.to.x, this.to.y);
        returnValue = undefined;
      } else {
        ctx.bezierCurveTo(via1.x, via1.y, via2.x, via2.y, this.to.x, this.to.y);
      }
      // draw shadow if enabled
      this.enableShadow(ctx);
      ctx.stroke();
      this.disableShadow(ctx);
      return returnValue;
    }
  }, {
    key: '_getViaCoordinates',
    value: function _getViaCoordinates() {
      var dx = this.from.x - this.to.x;
      var dy = this.from.y - this.to.y;

      var x1 = undefined,
          y1 = undefined,
          x2 = undefined,
          y2 = undefined;
      var roundness = this.options.smooth.roundness;;

      // horizontal if x > y or if direction is forced or if direction is horizontal
      if ((Math.abs(dx) > Math.abs(dy) || this.options.smooth.forceDirection === true || this.options.smooth.forceDirection === 'horizontal') && this.options.smooth.forceDirection !== 'vertical') {
        y1 = this.from.y;
        y2 = this.to.y;
        x1 = this.from.x - roundness * dx;
        x2 = this.to.x + roundness * dx;
      } else {
        y1 = this.from.y - roundness * dy;
        y2 = this.to.y + roundness * dy;
        x1 = this.from.x;
        x2 = this.to.x;
      }

      return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }
  }, {
    key: '_findBorderPosition',
    value: function _findBorderPosition(nearNode, ctx) {
      return this._findBorderPositionBezier(nearNode, ctx);
    }
  }, {
    key: '_getDistanceToEdge',
    value: function _getDistanceToEdge(x1, y1, x2, y2, x3, y3) {
      var _ref = arguments.length <= 6 || arguments[6] === undefined ? this._getViaCoordinates() : arguments[6];

      var _ref2 = _slicedToArray(_ref, 2);

      var via1 = _ref2[0];
      var via2 = _ref2[1];
      // x3,y3 is the point
      return this._getDistanceToBezierEdge(x1, y1, x2, y2, x3, y3, via1, via2);
    }

    /**
     * Combined function of pointOnLine and pointOnBezier. This gives the coordinates of a point on the line at a certain percentage of the way
     * @param percentage
     * @param via
     * @returns {{x: number, y: number}}
     * @private
     */
  }, {
    key: 'getPoint',
    value: function getPoint(percentage) {
      var _ref3 = arguments.length <= 1 || arguments[1] === undefined ? this._getViaCoordinates() : arguments[1];

      var _ref32 = _slicedToArray(_ref3, 2);

      var via1 = _ref32[0];
      var via2 = _ref32[1];

      var t = percentage;
      var vec = [];
      vec[0] = Math.pow(1 - t, 3);
      vec[1] = 3 * t * Math.pow(1 - t, 2);
      vec[2] = 3 * Math.pow(t, 2) * (1 - t);
      vec[3] = Math.pow(t, 3);
      var x = vec[0] * this.from.x + vec[1] * via1.x + vec[2] * via2.x + vec[3] * this.to.x;
      var y = vec[0] * this.from.y + vec[1] * via1.y + vec[2] * via2.y + vec[3] * this.to.y;

      return { x: x, y: y };
    }
  }]);

  return CubicBezierEdge;
})(_utilCubicBezierEdgeBase2['default']);

exports['default'] = CubicBezierEdge;
module.exports = exports['default'];

},{"./util/CubicBezierEdgeBase":38}],36:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilEdgeBase = require('./util/EdgeBase');

var _utilEdgeBase2 = _interopRequireDefault(_utilEdgeBase);

var StraightEdge = (function (_EdgeBase) {
  _inherits(StraightEdge, _EdgeBase);

  function StraightEdge(options, body, labelModule) {
    _classCallCheck(this, StraightEdge);

    _get(Object.getPrototypeOf(StraightEdge.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  /**
   * Draw a line between two nodes
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */

  _createClass(StraightEdge, [{
    key: '_line',
    value: function _line(ctx) {
      // draw a straight line
      ctx.beginPath();
      ctx.moveTo(this.from.x, this.from.y);
      ctx.lineTo(this.to.x, this.to.y);
      // draw shadow if enabled
      this.enableShadow(ctx);
      ctx.stroke();
      this.disableShadow(ctx);
      return undefined;
    }

    /**
     * Combined function of pointOnLine and pointOnBezier. This gives the coordinates of a point on the line at a certain percentage of the way
     * @param percentage
     * @param via
     * @returns {{x: number, y: number}}
     * @private
     */
  }, {
    key: 'getPoint',
    value: function getPoint(percentage) {
      return {
        x: (1 - percentage) * this.from.x + percentage * this.to.x,
        y: (1 - percentage) * this.from.y + percentage * this.to.y
      };
    }
  }, {
    key: '_findBorderPosition',
    value: function _findBorderPosition(nearNode, ctx) {
      var node1 = this.to;
      var node2 = this.from;
      if (nearNode.id === this.from.id) {
        node1 = this.from;
        node2 = this.to;
      }

      var angle = Math.atan2(node1.y - node2.y, node1.x - node2.x);
      var dx = node1.x - node2.x;
      var dy = node1.y - node2.y;
      var edgeSegmentLength = Math.sqrt(dx * dx + dy * dy);
      var toBorderDist = nearNode.distanceToBorder(ctx, angle);
      var toBorderPoint = (edgeSegmentLength - toBorderDist) / edgeSegmentLength;

      var borderPos = {};
      borderPos.x = (1 - toBorderPoint) * node2.x + toBorderPoint * node1.x;
      borderPos.y = (1 - toBorderPoint) * node2.y + toBorderPoint * node1.y;

      return borderPos;
    }
  }, {
    key: '_getDistanceToEdge',
    value: function _getDistanceToEdge(x1, y1, x2, y2, x3, y3) {
      // x3,y3 is the point
      return this._getDistanceToLine(x1, y1, x2, y2, x3, y3);
    }
  }]);

  return StraightEdge;
})(_utilEdgeBase2['default']);

exports['default'] = StraightEdge;
module.exports = exports['default'];

},{"./util/EdgeBase":39}],37:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x2, _x3, _x4) { var _again = true; _function: while (_again) { var object = _x2, property = _x3, receiver = _x4; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x2 = parent; _x3 = property; _x4 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _EdgeBase2 = require('./EdgeBase');

var _EdgeBase3 = _interopRequireDefault(_EdgeBase2);

var BezierEdgeBase = (function (_EdgeBase) {
  _inherits(BezierEdgeBase, _EdgeBase);

  function BezierEdgeBase(options, body, labelModule) {
    _classCallCheck(this, BezierEdgeBase);

    _get(Object.getPrototypeOf(BezierEdgeBase.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  /**
   * This function uses binary search to look for the point where the bezier curve crosses the border of the node.
   *
   * @param nearNode
   * @param ctx
   * @param viaNode
   * @param nearNode
   * @param ctx
   * @param viaNode
   * @param nearNode
   * @param ctx
   * @param viaNode
   */

  _createClass(BezierEdgeBase, [{
    key: '_findBorderPositionBezier',
    value: function _findBorderPositionBezier(nearNode, ctx) {
      var viaNode = arguments.length <= 2 || arguments[2] === undefined ? this._getViaCoordinates() : arguments[2];

      var maxIterations = 10;
      var iteration = 0;
      var low = 0;
      var high = 1;
      var pos, angle, distanceToBorder, distanceToPoint, difference;
      var threshold = 0.2;
      var node = this.to;
      var from = false;
      if (nearNode.id === this.from.id) {
        node = this.from;
        from = true;
      }

      while (low <= high && iteration < maxIterations) {
        var middle = (low + high) * 0.5;

        pos = this.getPoint(middle, viaNode);
        angle = Math.atan2(node.y - pos.y, node.x - pos.x);
        distanceToBorder = node.distanceToBorder(ctx, angle);
        distanceToPoint = Math.sqrt(Math.pow(pos.x - node.x, 2) + Math.pow(pos.y - node.y, 2));
        difference = distanceToBorder - distanceToPoint;
        if (Math.abs(difference) < threshold) {
          break; // found
        } else if (difference < 0) {
            // distance to nodes is larger than distance to border --> t needs to be bigger if we're looking at the to node.
            if (from === false) {
              low = middle;
            } else {
              high = middle;
            }
          } else {
            if (from === false) {
              high = middle;
            } else {
              low = middle;
            }
          }

        iteration++;
      }
      pos.t = middle;

      return pos;
    }

    /**
     * Calculate the distance between a point (x3,y3) and a line segment from
     * (x1,y1) to (x2,y2).
     * http://stackoverflow.com/questions/849211/shortest-distancae-between-a-point-and-a-line-segment
     * @param {number} x1 from x
     * @param {number} y1 from y
     * @param {number} x2 to x
     * @param {number} y2 to y
     * @param {number} x3 point to check x
     * @param {number} y3 point to check y
     * @private
     */
  }, {
    key: '_getDistanceToBezierEdge',
    value: function _getDistanceToBezierEdge(x1, y1, x2, y2, x3, y3, via) {
      // x3,y3 is the point
      var minDistance = 1e9;
      var distance = undefined;
      var i = undefined,
          t = undefined,
          x = undefined,
          y = undefined;
      var lastX = x1;
      var lastY = y1;
      for (i = 1; i < 10; i++) {
        t = 0.1 * i;
        x = Math.pow(1 - t, 2) * x1 + 2 * t * (1 - t) * via.x + Math.pow(t, 2) * x2;
        y = Math.pow(1 - t, 2) * y1 + 2 * t * (1 - t) * via.y + Math.pow(t, 2) * y2;
        if (i > 0) {
          distance = this._getDistanceToLine(lastX, lastY, x, y, x3, y3);
          minDistance = distance < minDistance ? distance : minDistance;
        }
        lastX = x;
        lastY = y;
      }

      return minDistance;
    }
  }]);

  return BezierEdgeBase;
})(_EdgeBase3['default']);

exports['default'] = BezierEdgeBase;
module.exports = exports['default'];

},{"./EdgeBase":39}],38:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _BezierEdgeBase2 = require('./BezierEdgeBase');

var _BezierEdgeBase3 = _interopRequireDefault(_BezierEdgeBase2);

var CubicBezierEdgeBase = (function (_BezierEdgeBase) {
  _inherits(CubicBezierEdgeBase, _BezierEdgeBase);

  function CubicBezierEdgeBase(options, body, labelModule) {
    _classCallCheck(this, CubicBezierEdgeBase);

    _get(Object.getPrototypeOf(CubicBezierEdgeBase.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  /**
   * Calculate the distance between a point (x3,y3) and a line segment from
   * (x1,y1) to (x2,y2).
   * http://stackoverflow.com/questions/849211/shortest-distancae-between-a-point-and-a-line-segment
   * https://en.wikipedia.org/wiki/B%C3%A9zier_curve
   * @param {number} x1 from x
   * @param {number} y1 from y
   * @param {number} x2 to x
   * @param {number} y2 to y
   * @param {number} x3 point to check x
   * @param {number} y3 point to check y
   * @private
   */

  _createClass(CubicBezierEdgeBase, [{
    key: '_getDistanceToBezierEdge',
    value: function _getDistanceToBezierEdge(x1, y1, x2, y2, x3, y3, via1, via2) {
      // x3,y3 is the point
      var minDistance = 1e9;
      var distance = undefined;
      var i = undefined,
          t = undefined,
          x = undefined,
          y = undefined;
      var lastX = x1;
      var lastY = y1;
      var vec = [0, 0, 0, 0];
      for (i = 1; i < 10; i++) {
        t = 0.1 * i;
        vec[0] = Math.pow(1 - t, 3);
        vec[1] = 3 * t * Math.pow(1 - t, 2);
        vec[2] = 3 * Math.pow(t, 2) * (1 - t);
        vec[3] = Math.pow(t, 3);
        x = vec[0] * x1 + vec[1] * via1.x + vec[2] * via2.x + vec[3] * x2;
        y = vec[0] * y1 + vec[1] * via1.y + vec[2] * via2.y + vec[3] * y2;
        if (i > 0) {
          distance = this._getDistanceToLine(lastX, lastY, x, y, x3, y3);
          minDistance = distance < minDistance ? distance : minDistance;
        }
        lastX = x;
        lastY = y;
      }

      return minDistance;
    }
  }]);

  return CubicBezierEdgeBase;
})(_BezierEdgeBase3['default']);

exports['default'] = CubicBezierEdgeBase;
module.exports = exports['default'];

},{"./BezierEdgeBase":37}],39:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var util = require("../../../../../util");

var EdgeBase = (function () {
  function EdgeBase(options, body, labelModule) {
    _classCallCheck(this, EdgeBase);

    this.body = body;
    this.labelModule = labelModule;
    this.options = {};
    this.setOptions(options);
    this.colorDirty = true;
    this.color = {};
    this.selectionWidth = 2;
    this.hoverWidth = 1.5;
  }

  _createClass(EdgeBase, [{
    key: 'connect',
    value: function connect() {
      this.from = this.body.nodes[this.options.from];
      this.to = this.body.nodes[this.options.to];
    }
  }, {
    key: 'cleanup',
    value: function cleanup() {
      return false;
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      this.options = options;
      this.from = this.body.nodes[this.options.from];
      this.to = this.body.nodes[this.options.to];
      this.id = this.options.id;
    }

    /**
     * Redraw a edge as a line
     * Draw this edge in the given canvas
     * The 2d context of a HTML canvas can be retrieved by canvas.getContext("2d");
     * @param {CanvasRenderingContext2D}   ctx
     * @private
     */
  }, {
    key: 'drawLine',
    value: function drawLine(ctx, selected, hover) {
      // set style
      ctx.strokeStyle = this.getColor(ctx, selected, hover);
      ctx.lineWidth = this.getLineWidth(selected, hover);
      var via = undefined;
      if (this.options.dashes !== false) {
        via = this._drawDashedLine(ctx);
      } else {
        via = this._drawLine(ctx);
      }
      return via;
    }
  }, {
    key: '_drawLine',
    value: function _drawLine(ctx) {
      var via = undefined;
      if (this.from != this.to) {
        // draw line
        via = this._line(ctx);
      } else {
        var _getCircleData2 = this._getCircleData(ctx);

        var _getCircleData22 = _slicedToArray(_getCircleData2, 3);

        var x = _getCircleData22[0];
        var y = _getCircleData22[1];
        var radius = _getCircleData22[2];

        this._circle(ctx, x, y, radius);
      }
      return via;
    }
  }, {
    key: '_drawDashedLine',
    value: function _drawDashedLine(ctx) {
      var via = undefined;
      ctx.lineCap = 'round';
      var pattern = [5, 5];
      if (Array.isArray(this.options.dashes) === true) {
        pattern = this.options.dashes;
      }

      // only firefox and chrome support this method, else we use the legacy one.
      if (ctx.setLineDash !== undefined) {
        ctx.save();

        // set dash settings for chrome or firefox
        ctx.setLineDash(pattern);
        ctx.lineDashOffset = 0;

        // draw the line
        if (this.from != this.to) {
          // draw line
          via = this._line(ctx);
        } else {
          var _getCircleData3 = this._getCircleData(ctx);

          var _getCircleData32 = _slicedToArray(_getCircleData3, 3);

          var x = _getCircleData32[0];
          var y = _getCircleData32[1];
          var radius = _getCircleData32[2];

          this._circle(ctx, x, y, radius);
        }

        // restore the dash settings.
        ctx.setLineDash([0]);
        ctx.lineDashOffset = 0;
        ctx.restore();
      } else {
        // unsupporting smooth lines
        if (this.from != this.to) {
          // draw line
          ctx.dashedLine(this.from.x, this.from.y, this.to.x, this.to.y, pattern);
        } else {
          var _getCircleData4 = this._getCircleData(ctx);

          var _getCircleData42 = _slicedToArray(_getCircleData4, 3);

          var x = _getCircleData42[0];
          var y = _getCircleData42[1];
          var radius = _getCircleData42[2];

          this._circle(ctx, x, y, radius);
        }
        // draw shadow if enabled
        this.enableShadow(ctx);

        ctx.stroke();

        // disable shadows for other elements.
        this.disableShadow(ctx);
      }
      return via;
    }
  }, {
    key: 'findBorderPosition',
    value: function findBorderPosition(nearNode, ctx, options) {
      if (this.from != this.to) {
        return this._findBorderPosition(nearNode, ctx, options);
      } else {
        return this._findBorderPositionCircle(nearNode, ctx, options);
      }
    }
  }, {
    key: 'findBorderPositions',
    value: function findBorderPositions(ctx) {
      var from = {};
      var to = {};
      if (this.from != this.to) {
        from = this._findBorderPosition(this.from, ctx);
        to = this._findBorderPosition(this.to, ctx);
      } else {
        var _getCircleData5 = this._getCircleData(ctx);

        var _getCircleData52 = _slicedToArray(_getCircleData5, 3);

        var x = _getCircleData52[0];
        var y = _getCircleData52[1];
        var radius = _getCircleData52[2];

        from = this._findBorderPositionCircle(this.from, ctx, { x: x, y: y, low: 0.25, high: 0.6, direction: -1 });
        to = this._findBorderPositionCircle(this.from, ctx, { x: x, y: y, low: 0.6, high: 0.8, direction: 1 });
      }
      return { from: from, to: to };
    }
  }, {
    key: '_getCircleData',
    value: function _getCircleData(ctx) {
      var x = undefined,
          y = undefined;
      var node = this.from;
      var radius = this.options.selfReferenceSize;

      if (ctx !== undefined) {
        if (node.shape.width === undefined) {
          node.shape.resize(ctx);
        }
      }

      // get circle coordinates
      if (node.shape.width > node.shape.height) {
        x = node.x + node.shape.width * 0.5;
        y = node.y - radius;
      } else {
        x = node.x + radius;
        y = node.y - node.shape.height * 0.5;
      }
      return [x, y, radius];
    }

    /**
     * Get a point on a circle
     * @param {Number} x
     * @param {Number} y
     * @param {Number} radius
     * @param {Number} percentage. Value between 0 (line start) and 1 (line end)
     * @return {Object} point
     * @private
     */
  }, {
    key: '_pointOnCircle',
    value: function _pointOnCircle(x, y, radius, percentage) {
      var angle = percentage * 2 * Math.PI;
      return {
        x: x + radius * Math.cos(angle),
        y: y - radius * Math.sin(angle)
      };
    }

    /**
     * This function uses binary search to look for the point where the circle crosses the border of the node.
     * @param node
     * @param ctx
     * @param options
     * @returns {*}
     * @private
     */
  }, {
    key: '_findBorderPositionCircle',
    value: function _findBorderPositionCircle(node, ctx, options) {
      var x = options.x;
      var y = options.y;
      var low = options.low;
      var high = options.high;
      var direction = options.direction;

      var maxIterations = 10;
      var iteration = 0;
      var radius = this.options.selfReferenceSize;
      var pos = undefined,
          angle = undefined,
          distanceToBorder = undefined,
          distanceToPoint = undefined,
          difference = undefined;
      var threshold = 0.05;
      var middle = (low + high) * 0.5;

      while (low <= high && iteration < maxIterations) {
        middle = (low + high) * 0.5;

        pos = this._pointOnCircle(x, y, radius, middle);
        angle = Math.atan2(node.y - pos.y, node.x - pos.x);
        distanceToBorder = node.distanceToBorder(ctx, angle);
        distanceToPoint = Math.sqrt(Math.pow(pos.x - node.x, 2) + Math.pow(pos.y - node.y, 2));
        difference = distanceToBorder - distanceToPoint;
        if (Math.abs(difference) < threshold) {
          break; // found
        } else if (difference > 0) {
            // distance to nodes is larger than distance to border --> t needs to be bigger if we're looking at the to node.
            if (direction > 0) {
              low = middle;
            } else {
              high = middle;
            }
          } else {
            if (direction > 0) {
              high = middle;
            } else {
              low = middle;
            }
          }
        iteration++;
      }
      pos.t = middle;

      return pos;
    }

    /**
     * Get the line width of the edge. Depends on width and whether one of the
     * connected nodes is selected.
     * @return {Number} width
     * @private
     */
  }, {
    key: 'getLineWidth',
    value: function getLineWidth(selected, hover) {
      if (selected === true) {
        return Math.max(this.selectionWidth, 0.3 / this.body.view.scale);
      } else {
        if (hover === true) {
          return Math.max(this.hoverWidth, 0.3 / this.body.view.scale);
        } else {
          return Math.max(this.options.width, 0.3 / this.body.view.scale);
        }
      }
    }
  }, {
    key: 'getColor',
    value: function getColor(ctx, selected, hover) {
      var colorOptions = this.options.color;
      if (colorOptions.inherit !== false) {
        // when this is a loop edge, just use the 'from' method
        if (colorOptions.inherit === 'both' && this.from.id !== this.to.id) {
          var grd = ctx.createLinearGradient(this.from.x, this.from.y, this.to.x, this.to.y);
          var fromColor = undefined,
              toColor = undefined;
          fromColor = this.from.options.color.highlight.border;
          toColor = this.to.options.color.highlight.border;

          if (this.from.selected === false && this.to.selected === false) {
            fromColor = util.overrideOpacity(this.from.options.color.border, this.options.color.opacity);
            toColor = util.overrideOpacity(this.to.options.color.border, this.options.color.opacity);
          } else if (this.from.selected === true && this.to.selected === false) {
            toColor = this.to.options.color.border;
          } else if (this.from.selected === false && this.to.selected === true) {
            fromColor = this.from.options.color.border;
          }
          grd.addColorStop(0, fromColor);
          grd.addColorStop(1, toColor);

          // -------------------- this returns -------------------- //
          return grd;
        }

        if (this.colorDirty === true) {
          if (colorOptions.inherit === "to") {
            this.color.highlight = this.to.options.color.highlight.border;
            this.color.hover = this.to.options.color.hover.border;
            this.color.color = util.overrideOpacity(this.to.options.color.border, colorOptions.opacity);
          } else {
            // (this.options.color.inherit.source === "from") {
            this.color.highlight = this.from.options.color.highlight.border;
            this.color.hover = this.from.options.color.hover.border;
            this.color.color = util.overrideOpacity(this.from.options.color.border, colorOptions.opacity);
          }
        }
      } else if (this.colorDirty === true) {
        this.color.highlight = colorOptions.highlight;
        this.color.hover = colorOptions.hover;
        this.color.color = util.overrideOpacity(colorOptions.color, colorOptions.opacity);
      }

      // if color inherit is on and gradients are used, the function has already returned by now.
      this.colorDirty = false;

      if (selected === true) {
        return this.color.highlight;
      } else if (hover === true) {
        return this.color.hover;
      } else {
        return this.color.color;
      }
    }

    /**
     * Draw a line from a node to itself, a circle
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} x
     * @param {Number} y
     * @param {Number} radius
     * @private
     */
  }, {
    key: '_circle',
    value: function _circle(ctx, x, y, radius) {
      // draw shadow if enabled
      this.enableShadow(ctx);

      // draw a circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
      ctx.stroke();

      // disable shadows for other elements.
      this.disableShadow(ctx);
    }

    /**
     * Calculate the distance between a point (x3,y3) and a line segment from
     * (x1,y1) to (x2,y2).
     * http://stackoverflow.com/questions/849211/shortest-distancae-between-a-point-and-a-line-segment
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} x3
     * @param {number} y3
     * @private
     */
  }, {
    key: 'getDistanceToEdge',
    value: function getDistanceToEdge(x1, y1, x2, y2, x3, y3, via) {
      // x3,y3 is the point
      var returnValue = 0;
      if (this.from != this.to) {
        returnValue = this._getDistanceToEdge(x1, y1, x2, y2, x3, y3, via);
      } else {
        var _getCircleData6 = this._getCircleData();

        var _getCircleData62 = _slicedToArray(_getCircleData6, 3);

        var x = _getCircleData62[0];
        var y = _getCircleData62[1];
        var radius = _getCircleData62[2];

        var dx = x - x3;
        var dy = y - y3;
        returnValue = Math.abs(Math.sqrt(dx * dx + dy * dy) - radius);
      }

      if (this.labelModule.size.left < x3 && this.labelModule.size.left + this.labelModule.size.width > x3 && this.labelModule.size.top < y3 && this.labelModule.size.top + this.labelModule.size.height > y3) {
        return 0;
      } else {
        return returnValue;
      }
    }
  }, {
    key: '_getDistanceToLine',
    value: function _getDistanceToLine(x1, y1, x2, y2, x3, y3) {
      var px = x2 - x1;
      var py = y2 - y1;
      var something = px * px + py * py;
      var u = ((x3 - x1) * px + (y3 - y1) * py) / something;

      if (u > 1) {
        u = 1;
      } else if (u < 0) {
        u = 0;
      }

      var x = x1 + u * px;
      var y = y1 + u * py;
      var dx = x - x3;
      var dy = y - y3;

      //# Note: If the actual distance does not matter,
      //# if you only want to compare what this function
      //# returns to other results of this function, you
      //# can just return the squared distance instead
      //# (i.e. remove the sqrt) to gain a little performance

      return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     *
     * @param ctx
     * @param position
     * @param viaNode
     */
  }, {
    key: 'drawArrowHead',
    value: function drawArrowHead(ctx, position, viaNode, selected, hover) {
      // set style
      ctx.strokeStyle = this.getColor(ctx, selected, hover);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = this.getLineWidth(selected, hover);

      // set lets
      var angle = undefined;
      var length = undefined;
      var arrowPos = undefined;
      var node1 = undefined;
      var node2 = undefined;
      var guideOffset = undefined;
      var scaleFactor = undefined;

      if (position === 'from') {
        node1 = this.from;
        node2 = this.to;
        guideOffset = 0.1;
        scaleFactor = this.options.arrows.from.scaleFactor;
      } else if (position === 'to') {
        node1 = this.to;
        node2 = this.from;
        guideOffset = -0.1;
        scaleFactor = this.options.arrows.to.scaleFactor;
      } else {
        node1 = this.to;
        node2 = this.from;
        scaleFactor = this.options.arrows.middle.scaleFactor;
      }

      // if not connected to itself
      if (node1 != node2) {
        if (position !== 'middle') {
          // draw arrow head
          if (this.options.smooth.enabled === true) {
            arrowPos = this.findBorderPosition(node1, ctx, { via: viaNode });
            var guidePos = this.getPoint(Math.max(0.0, Math.min(1.0, arrowPos.t + guideOffset)), viaNode);
            angle = Math.atan2(arrowPos.y - guidePos.y, arrowPos.x - guidePos.x);
          } else {
            angle = Math.atan2(node1.y - node2.y, node1.x - node2.x);
            arrowPos = this.findBorderPosition(node1, ctx);
          }
        } else {
          angle = Math.atan2(node1.y - node2.y, node1.x - node2.x);
          arrowPos = this.getPoint(0.6, viaNode); // this is 0.6 to account for the size of the arrow.
        }
        // draw arrow at the end of the line
        length = (10 + 5 * this.options.width) * scaleFactor;
        ctx.arrow(arrowPos.x, arrowPos.y, angle, length);

        // draw shadow if enabled
        this.enableShadow(ctx);
        ctx.fill();

        // disable shadows for other elements.
        this.disableShadow(ctx);
        ctx.stroke();
      } else {
        // draw circle
        var _angle = undefined,
            point = undefined;

        var _getCircleData7 = this._getCircleData(ctx);

        var _getCircleData72 = _slicedToArray(_getCircleData7, 3);

        var x = _getCircleData72[0];
        var y = _getCircleData72[1];
        var radius = _getCircleData72[2];

        if (position === 'from') {
          point = this.findBorderPosition(this.from, ctx, { x: x, y: y, low: 0.25, high: 0.6, direction: -1 });
          _angle = point.t * -2 * Math.PI + 1.5 * Math.PI + 0.1 * Math.PI;
        } else if (position === 'to') {
          point = this.findBorderPosition(this.from, ctx, { x: x, y: y, low: 0.6, high: 1.0, direction: 1 });
          _angle = point.t * -2 * Math.PI + 1.5 * Math.PI - 1.1 * Math.PI;
        } else {
          point = this._pointOnCircle(x, y, radius, 0.175);
          _angle = 3.9269908169872414; // === 0.175 * -2 * Math.PI + 1.5 * Math.PI + 0.1 * Math.PI;
        }

        // draw the arrowhead
        var _length = (10 + 5 * this.options.width) * scaleFactor;
        ctx.arrow(point.x, point.y, _angle, _length);

        // draw shadow if enabled
        this.enableShadow(ctx);
        ctx.fill();

        // disable shadows for other elements.
        this.disableShadow(ctx);
        ctx.stroke();
      }
    }
  }, {
    key: 'enableShadow',
    value: function enableShadow(ctx) {
      if (this.options.shadow.enabled === true) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = this.options.shadow.size;
        ctx.shadowOffsetX = this.options.shadow.x;
        ctx.shadowOffsetY = this.options.shadow.y;
      }
    }
  }, {
    key: 'disableShadow',
    value: function disableShadow(ctx) {
      if (this.options.shadow.enabled === true) {
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }
  }]);

  return EdgeBase;
})();

exports['default'] = EdgeBase;
module.exports = exports['default'];

},{"../../../../../util":73}],40:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _Node2 = require('../Node');

var _Node3 = _interopRequireDefault(_Node2);

/**
 *
 */

var Cluster = (function (_Node) {
  _inherits(Cluster, _Node);

  function Cluster(options, body, imagelist, grouplist, globalOptions) {
    _classCallCheck(this, Cluster);

    _get(Object.getPrototypeOf(Cluster.prototype), 'constructor', this).call(this, options, body, imagelist, grouplist, globalOptions);

    this.isCluster = true;
    this.containedNodes = {};
    this.containedEdges = {};
  }

  return Cluster;
})(_Node3['default']);

exports['default'] = Cluster;
module.exports = exports['default'];

},{"../Node":30}],41:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var Box = (function (_NodeBase) {
  _inherits(Box, _NodeBase);

  function Box(options, body, labelModule) {
    _classCallCheck(this, Box);

    _get(Object.getPrototypeOf(Box.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Box, [{
    key: 'resize',
    value: function resize(ctx, selected) {
      if (this.width === undefined) {
        var margin = 5;
        var textSize = this.labelModule.getTextSize(ctx, selected);
        this.width = textSize.width + 2 * margin;
        this.height = textSize.height + 2 * margin;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize(ctx, selected);
      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      var borderWidth = this.options.borderWidth;
      var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

      ctx.strokeStyle = selected ? this.options.color.highlight.border : hover ? this.options.color.hover.border : this.options.color.border;
      ctx.lineWidth = selected ? selectionLineWidth : borderWidth;
      ctx.lineWidth /= this.body.view.scale;
      ctx.lineWidth = Math.min(this.width, ctx.lineWidth);

      ctx.fillStyle = selected ? this.options.color.highlight.background : hover ? this.options.color.hover.background : this.options.color.background;

      var borderRadius = this.options.shapeProperties.borderRadius; // only effective for box
      ctx.roundRect(this.left, this.top, this.width, this.height, borderRadius);

      // draw shadow if enabled
      this.enableShadow(ctx);
      // draw the background
      ctx.fill();
      // disable shadows for other elements.
      this.disableShadow(ctx);

      //draw dashed border if enabled, save and restore is required for firefox not to crash on unix.
      ctx.save();
      this.enableBorderDashes(ctx);
      //draw the border
      ctx.stroke();
      //disable dashed border for other elements
      this.disableBorderDashes(ctx);
      ctx.restore();

      this.updateBoundingBox(x, y, ctx, selected);
      this.labelModule.draw(ctx, x, y, selected);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y, ctx, selected) {
      this.resize(ctx, selected);
      this.left = x - this.width * 0.5;
      this.top = y - this.height * 0.5;

      this.boundingBox.left = this.left;
      this.boundingBox.top = this.top;
      this.boundingBox.bottom = this.top + this.height;
      this.boundingBox.right = this.left + this.width;
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      var a = this.width / 2;
      var b = this.height / 2;
      var w = Math.sin(angle) * a;
      var h = Math.cos(angle) * b;
      return a * b / Math.sqrt(w * w + h * h);
    }
  }]);

  return Box;
})(_utilNodeBase2['default']);

exports['default'] = Box;
module.exports = exports['default'];

},{"../util/NodeBase":56}],42:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilCircleImageBase = require('../util/CircleImageBase');

var _utilCircleImageBase2 = _interopRequireDefault(_utilCircleImageBase);

var Circle = (function (_CircleImageBase) {
  _inherits(Circle, _CircleImageBase);

  function Circle(options, body, labelModule) {
    _classCallCheck(this, Circle);

    _get(Object.getPrototypeOf(Circle.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Circle, [{
    key: 'resize',
    value: function resize(ctx, selected) {
      if (this.width === undefined) {
        var margin = 5;
        var textSize = this.labelModule.getTextSize(ctx, selected);
        var diameter = Math.max(textSize.width, textSize.height) + 2 * margin;
        this.options.size = diameter / 2;

        this.width = diameter;
        this.height = diameter;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize(ctx, selected);
      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      this._drawRawCircle(ctx, x, y, selected, hover, this.options.size);

      this.boundingBox.top = y - this.options.size;
      this.boundingBox.left = x - this.options.size;
      this.boundingBox.right = x + this.options.size;
      this.boundingBox.bottom = y + this.options.size;

      this.updateBoundingBox(x, y);
      this.labelModule.draw(ctx, x, y, selected);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y) {
      this.boundingBox.top = y - this.options.size;
      this.boundingBox.left = x - this.options.size;
      this.boundingBox.right = x + this.options.size;
      this.boundingBox.bottom = y + this.options.size;
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      var a = this.width / 2;
      var b = this.height / 2;
      var w = Math.sin(angle) * a;
      var h = Math.cos(angle) * b;
      return a * b / Math.sqrt(w * w + h * h);
    }
  }]);

  return Circle;
})(_utilCircleImageBase2['default']);

exports['default'] = Circle;
module.exports = exports['default'];

},{"../util/CircleImageBase":55}],43:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilCircleImageBase = require('../util/CircleImageBase');

var _utilCircleImageBase2 = _interopRequireDefault(_utilCircleImageBase);

var CircularImage = (function (_CircleImageBase) {
  _inherits(CircularImage, _CircleImageBase);

  function CircularImage(options, body, labelModule, imageObj) {
    _classCallCheck(this, CircularImage);

    _get(Object.getPrototypeOf(CircularImage.prototype), 'constructor', this).call(this, options, body, labelModule);
    this.imageObj = imageObj;
    this._swapToImageResizeWhenImageLoaded = true;
  }

  _createClass(CircularImage, [{
    key: 'resize',
    value: function resize() {
      if (this.imageObj.src === undefined || this.imageObj.width === undefined || this.imageObj.height === undefined) {
        if (!this.width) {
          var diameter = this.options.size * 2;
          this.width = diameter;
          this.height = diameter;
          this._swapToImageResizeWhenImageLoaded = true;
          this.radius = 0.5 * this.width;
        }
      } else {
        if (this._swapToImageResizeWhenImageLoaded) {
          this.width = undefined;
          this.height = undefined;
          this._swapToImageResizeWhenImageLoaded = false;
        }
        this._resizeImage();
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize();

      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      var size = Math.min(0.5 * this.height, 0.5 * this.width);

      // draw the backgroun circle. IMPORTANT: the stroke in this method is used by the clip method below.
      this._drawRawCircle(ctx, x, y, selected, hover, size);

      // now we draw in the cicle, we save so we can revert the clip operation after drawing.
      ctx.save();
      // clip is used to use the stroke in drawRawCircle as an area that we can draw in.
      ctx.clip();
      // draw the image
      this._drawImageAtPosition(ctx);
      // restore so we can again draw on the full canvas
      ctx.restore();

      this._drawImageLabel(ctx, x, y, selected);

      this.updateBoundingBox(x, y);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y) {
      this.boundingBox.top = y - this.options.size;
      this.boundingBox.left = x - this.options.size;
      this.boundingBox.right = x + this.options.size;
      this.boundingBox.bottom = y + this.options.size;
      this.boundingBox.left = Math.min(this.boundingBox.left, this.labelModule.size.left);
      this.boundingBox.right = Math.max(this.boundingBox.right, this.labelModule.size.left + this.labelModule.size.width);
      this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelOffset);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return CircularImage;
})(_utilCircleImageBase2['default']);

exports['default'] = CircularImage;
module.exports = exports['default'];

},{"../util/CircleImageBase":55}],44:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var Database = (function (_NodeBase) {
  _inherits(Database, _NodeBase);

  function Database(options, body, labelModule) {
    _classCallCheck(this, Database);

    _get(Object.getPrototypeOf(Database.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Database, [{
    key: 'resize',
    value: function resize(ctx, selected) {
      if (this.width === undefined) {
        var margin = 5;
        var textSize = this.labelModule.getTextSize(ctx, selected);
        var size = textSize.width + 2 * margin;
        this.width = size;
        this.height = size;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize(ctx, selected);
      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      var borderWidth = this.options.borderWidth;
      var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

      ctx.strokeStyle = selected ? this.options.color.highlight.border : hover ? this.options.color.hover.border : this.options.color.border;
      ctx.lineWidth = this.selected ? selectionLineWidth : borderWidth;
      ctx.lineWidth *= this.networkScaleInv;
      ctx.lineWidth = Math.min(this.width, ctx.lineWidth);

      ctx.fillStyle = selected ? this.options.color.highlight.background : hover ? this.options.color.hover.background : this.options.color.background;
      ctx.database(x - this.width / 2, y - this.height * 0.5, this.width, this.height);

      // draw shadow if enabled
      this.enableShadow(ctx);
      // draw the background
      ctx.fill();
      // disable shadows for other elements.
      this.disableShadow(ctx);

      //draw dashed border if enabled, save and restore is required for firefox not to crash on unix.
      ctx.save();
      this.enableBorderDashes(ctx);
      //draw the border
      ctx.stroke();
      //disable dashed border for other elements
      this.disableBorderDashes(ctx);
      ctx.restore();

      this.updateBoundingBox(x, y, ctx, selected);
      this.labelModule.draw(ctx, x, y, selected);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y, ctx, selected) {
      this.resize(ctx, selected);

      this.left = x - this.width * 0.5;
      this.top = y - this.height * 0.5;

      this.boundingBox.left = this.left;
      this.boundingBox.top = this.top;
      this.boundingBox.bottom = this.top + this.height;
      this.boundingBox.right = this.left + this.width;
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      var a = this.width / 2;
      var b = this.height / 2;
      var w = Math.sin(angle) * a;
      var h = Math.cos(angle) * b;
      return a * b / Math.sqrt(w * w + h * h);
    }
  }]);

  return Database;
})(_utilNodeBase2['default']);

exports['default'] = Database;
module.exports = exports['default'];

},{"../util/NodeBase":56}],45:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilShapeBase = require('../util/ShapeBase');

var _utilShapeBase2 = _interopRequireDefault(_utilShapeBase);

var Diamond = (function (_ShapeBase) {
  _inherits(Diamond, _ShapeBase);

  function Diamond(options, body, labelModule) {
    _classCallCheck(this, Diamond);

    _get(Object.getPrototypeOf(Diamond.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Diamond, [{
    key: 'resize',
    value: function resize(ctx) {
      this._resizeShape();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this._drawShape(ctx, 'diamond', 4, x, y, selected, hover);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return Diamond;
})(_utilShapeBase2['default']);

exports['default'] = Diamond;
module.exports = exports['default'];

},{"../util/ShapeBase":57}],46:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilShapeBase = require('../util/ShapeBase');

var _utilShapeBase2 = _interopRequireDefault(_utilShapeBase);

var Dot = (function (_ShapeBase) {
  _inherits(Dot, _ShapeBase);

  function Dot(options, body, labelModule) {
    _classCallCheck(this, Dot);

    _get(Object.getPrototypeOf(Dot.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Dot, [{
    key: 'resize',
    value: function resize(ctx) {
      this._resizeShape();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this._drawShape(ctx, 'circle', 2, x, y, selected, hover);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      return this.options.size + this.options.borderWidth;
    }
  }]);

  return Dot;
})(_utilShapeBase2['default']);

exports['default'] = Dot;
module.exports = exports['default'];

},{"../util/ShapeBase":57}],47:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var Ellipse = (function (_NodeBase) {
  _inherits(Ellipse, _NodeBase);

  function Ellipse(options, body, labelModule) {
    _classCallCheck(this, Ellipse);

    _get(Object.getPrototypeOf(Ellipse.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Ellipse, [{
    key: 'resize',
    value: function resize(ctx, selected) {
      if (this.width === undefined) {
        var textSize = this.labelModule.getTextSize(ctx, selected);

        this.width = textSize.width * 1.5;
        this.height = textSize.height * 2;
        if (this.width < this.height) {
          this.width = this.height;
        }
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize(ctx, selected);
      this.left = x - this.width * 0.5;
      this.top = y - this.height * 0.5;

      var borderWidth = this.options.borderWidth;
      var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

      ctx.strokeStyle = selected ? this.options.color.highlight.border : hover ? this.options.color.hover.border : this.options.color.border;

      ctx.lineWidth = selected ? selectionLineWidth : borderWidth;
      ctx.lineWidth /= this.body.view.scale;
      ctx.lineWidth = Math.min(this.width, ctx.lineWidth);

      ctx.fillStyle = selected ? this.options.color.highlight.background : hover ? this.options.color.hover.background : this.options.color.background;
      ctx.ellipse(this.left, this.top, this.width, this.height);

      // draw shadow if enabled
      this.enableShadow(ctx);
      // draw the background
      ctx.fill();
      // disable shadows for other elements.
      this.disableShadow(ctx);

      //draw dashed border if enabled, save and restore is required for firefox not to crash on unix.
      ctx.save();
      this.enableBorderDashes(ctx);
      //draw the border
      ctx.stroke();
      //disable dashed border for other elements
      this.disableBorderDashes(ctx);
      ctx.restore();

      this.updateBoundingBox(x, y, ctx, selected);
      this.labelModule.draw(ctx, x, y, selected);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y, ctx, selected) {
      this.resize(ctx, selected); // just in case

      this.left = x - this.width * 0.5;
      this.top = y - this.height * 0.5;

      this.boundingBox.left = this.left;
      this.boundingBox.top = this.top;
      this.boundingBox.bottom = this.top + this.height;
      this.boundingBox.right = this.left + this.width;
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      var a = this.width * 0.5;
      var b = this.height * 0.5;
      var w = Math.sin(angle) * a;
      var h = Math.cos(angle) * b;
      return a * b / Math.sqrt(w * w + h * h);
    }
  }]);

  return Ellipse;
})(_utilNodeBase2['default']);

exports['default'] = Ellipse;
module.exports = exports['default'];

},{"../util/NodeBase":56}],48:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var Icon = (function (_NodeBase) {
  _inherits(Icon, _NodeBase);

  function Icon(options, body, labelModule) {
    _classCallCheck(this, Icon);

    _get(Object.getPrototypeOf(Icon.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Icon, [{
    key: 'resize',
    value: function resize(ctx) {
      if (this.width === undefined) {
        var margin = 5;
        var iconSize = {
          width: Number(this.options.icon.size),
          height: Number(this.options.icon.size)
        };
        this.width = iconSize.width + 2 * margin;
        this.height = iconSize.height + 2 * margin;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize(ctx);
      this.options.icon.size = this.options.icon.size || 50;

      this.left = x - this.width * 0.5;
      this.top = y - this.height * 0.5;
      this._icon(ctx, x, y, selected);

      if (this.options.label !== undefined) {
        var iconTextSpacing = 5;
        this.labelModule.draw(ctx, x, y + this.height * 0.5 + iconTextSpacing, selected);
      }

      this.updateBoundingBox(x, y);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y) {
      this.boundingBox.top = y - this.options.icon.size * 0.5;
      this.boundingBox.left = x - this.options.icon.size * 0.5;
      this.boundingBox.right = x + this.options.icon.size * 0.5;
      this.boundingBox.bottom = y + this.options.icon.size * 0.5;

      if (this.options.label !== undefined && this.labelModule.size.width > 0) {
        var iconTextSpacing = 5;
        this.boundingBox.left = Math.min(this.boundingBox.left, this.labelModule.size.left);
        this.boundingBox.right = Math.max(this.boundingBox.right, this.labelModule.size.left + this.labelModule.size.width);
        this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelModule.size.height + iconTextSpacing);
      }
    }
  }, {
    key: '_icon',
    value: function _icon(ctx, x, y, selected) {
      var iconSize = Number(this.options.icon.size);

      if (this.options.icon.code !== undefined) {
        ctx.font = (selected ? "bold " : "") + iconSize + "px " + this.options.icon.face;

        // draw icon
        ctx.fillStyle = this.options.icon.color || "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // draw shadow if enabled
        this.enableShadow(ctx);
        ctx.fillText(this.options.icon.code, x, y);

        // disable shadows for other elements.
        this.disableShadow(ctx);
      } else {
        console.error('When using the icon shape, you need to define the code in the icon options object. This can be done per node or globally.');
      }
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return Icon;
})(_utilNodeBase2['default']);

exports['default'] = Icon;
module.exports = exports['default'];

},{"../util/NodeBase":56}],49:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilCircleImageBase = require('../util/CircleImageBase');

var _utilCircleImageBase2 = _interopRequireDefault(_utilCircleImageBase);

var Image = (function (_CircleImageBase) {
  _inherits(Image, _CircleImageBase);

  function Image(options, body, labelModule, imageObj) {
    _classCallCheck(this, Image);

    _get(Object.getPrototypeOf(Image.prototype), 'constructor', this).call(this, options, body, labelModule);
    this.imageObj = imageObj;
  }

  _createClass(Image, [{
    key: 'resize',
    value: function resize() {
      this._resizeImage();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize();
      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      if (this.options.shapeProperties.useBorderWithImage === true) {
        var borderWidth = this.options.borderWidth;

        var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

        ctx.beginPath();

        // setup the line properties.
        ctx.strokeStyle = selected ? this.options.color.highlight.border : hover ? this.options.color.hover.border : this.options.color.border;
        ctx.lineWidth = selected ? selectionLineWidth : borderWidth;
        ctx.lineWidth /= this.body.view.scale;
        ctx.lineWidth = Math.min(this.width, ctx.lineWidth);

        // set a fillstyle
        ctx.fillStyle = selected ? this.options.color.highlight.background : hover ? this.options.color.hover.background : this.options.color.background;

        // draw a rectangle to form the border around. This rectangle is filled so the opacity of a picture (in future vis releases?) can be used to tint the image
        ctx.rect(this.left - 0.5 * ctx.lineWidth, this.top - 0.5 * ctx.lineWidth, this.width + ctx.lineWidth, this.height + ctx.lineWidth);
        ctx.fill();

        //draw dashed border if enabled, save and restore is required for firefox not to crash on unix.
        ctx.save();
        this.enableBorderDashes(ctx);
        //draw the border
        ctx.stroke();
        //disable dashed border for other elements
        this.disableBorderDashes(ctx);
        ctx.restore();

        ctx.closePath();
      }

      this._drawImageAtPosition(ctx);

      this._drawImageLabel(ctx, x, y, selected || hover);

      this.updateBoundingBox(x, y);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y) {
      this.resize();
      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      this.boundingBox.top = this.top;
      this.boundingBox.left = this.left;
      this.boundingBox.right = this.left + this.width;
      this.boundingBox.bottom = this.top + this.height;

      if (this.options.label !== undefined && this.labelModule.size.width > 0) {
        this.boundingBox.left = Math.min(this.boundingBox.left, this.labelModule.size.left);
        this.boundingBox.right = Math.max(this.boundingBox.right, this.labelModule.size.left + this.labelModule.size.width);
        this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelOffset);
      }
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      this.resize(ctx);
      var a = this.width / 2;
      var b = this.height / 2;
      var w = Math.sin(angle) * a;
      var h = Math.cos(angle) * b;
      return a * b / Math.sqrt(w * w + h * h);
    }
  }]);

  return Image;
})(_utilCircleImageBase2['default']);

exports['default'] = Image;
module.exports = exports['default'];

},{"../util/CircleImageBase":55}],50:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilShapeBase = require('../util/ShapeBase');

var _utilShapeBase2 = _interopRequireDefault(_utilShapeBase);

var Square = (function (_ShapeBase) {
  _inherits(Square, _ShapeBase);

  function Square(options, body, labelModule) {
    _classCallCheck(this, Square);

    _get(Object.getPrototypeOf(Square.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Square, [{
    key: 'resize',
    value: function resize() {
      this._resizeShape();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this._drawShape(ctx, 'square', 2, x, y, selected, hover);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return Square;
})(_utilShapeBase2['default']);

exports['default'] = Square;
module.exports = exports['default'];

},{"../util/ShapeBase":57}],51:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilShapeBase = require('../util/ShapeBase');

var _utilShapeBase2 = _interopRequireDefault(_utilShapeBase);

var Star = (function (_ShapeBase) {
  _inherits(Star, _ShapeBase);

  function Star(options, body, labelModule) {
    _classCallCheck(this, Star);

    _get(Object.getPrototypeOf(Star.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Star, [{
    key: 'resize',
    value: function resize(ctx) {
      this._resizeShape();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this._drawShape(ctx, 'star', 4, x, y, selected, hover);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return Star;
})(_utilShapeBase2['default']);

exports['default'] = Star;
module.exports = exports['default'];

},{"../util/ShapeBase":57}],52:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var Text = (function (_NodeBase) {
  _inherits(Text, _NodeBase);

  function Text(options, body, labelModule) {
    _classCallCheck(this, Text);

    _get(Object.getPrototypeOf(Text.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Text, [{
    key: 'resize',
    value: function resize(ctx, selected) {
      if (this.width === undefined) {
        var margin = 5;
        var textSize = this.labelModule.getTextSize(ctx, selected);
        this.width = textSize.width + 2 * margin;
        this.height = textSize.height + 2 * margin;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this.resize(ctx, selected || hover);
      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      // draw shadow if enabled
      this.enableShadow(ctx);
      this.labelModule.draw(ctx, x, y, selected || hover);

      // disable shadows for other elements.
      this.disableShadow(ctx);

      this.updateBoundingBox(x, y, ctx, selected);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y, ctx, selected) {
      this.resize(ctx, selected);

      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      this.boundingBox.top = this.top;
      this.boundingBox.left = this.left;
      this.boundingBox.right = this.left + this.width;
      this.boundingBox.bottom = this.top + this.height;
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return Text;
})(_utilNodeBase2['default']);

exports['default'] = Text;
module.exports = exports['default'];

},{"../util/NodeBase":56}],53:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilShapeBase = require('../util/ShapeBase');

var _utilShapeBase2 = _interopRequireDefault(_utilShapeBase);

var Triangle = (function (_ShapeBase) {
  _inherits(Triangle, _ShapeBase);

  function Triangle(options, body, labelModule) {
    _classCallCheck(this, Triangle);

    _get(Object.getPrototypeOf(Triangle.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(Triangle, [{
    key: 'resize',
    value: function resize(ctx) {
      this._resizeShape();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this._drawShape(ctx, 'triangle', 3, x, y, selected, hover);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return Triangle;
})(_utilShapeBase2['default']);

exports['default'] = Triangle;
module.exports = exports['default'];

},{"../util/ShapeBase":57}],54:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilShapeBase = require('../util/ShapeBase');

var _utilShapeBase2 = _interopRequireDefault(_utilShapeBase);

var TriangleDown = (function (_ShapeBase) {
  _inherits(TriangleDown, _ShapeBase);

  function TriangleDown(options, body, labelModule) {
    _classCallCheck(this, TriangleDown);

    _get(Object.getPrototypeOf(TriangleDown.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(TriangleDown, [{
    key: 'resize',
    value: function resize(ctx) {
      this._resizeShape();
    }
  }, {
    key: 'draw',
    value: function draw(ctx, x, y, selected, hover) {
      this._drawShape(ctx, 'triangleDown', 3, x, y, selected, hover);
    }
  }, {
    key: 'distanceToBorder',
    value: function distanceToBorder(ctx, angle) {
      return this._distanceToBorder(ctx, angle);
    }
  }]);

  return TriangleDown;
})(_utilShapeBase2['default']);

exports['default'] = TriangleDown;
module.exports = exports['default'];

},{"../util/ShapeBase":57}],55:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var CircleImageBase = (function (_NodeBase) {
  _inherits(CircleImageBase, _NodeBase);

  function CircleImageBase(options, body, labelModule) {
    _classCallCheck(this, CircleImageBase);

    _get(Object.getPrototypeOf(CircleImageBase.prototype), 'constructor', this).call(this, options, body, labelModule);
    this.labelOffset = 0;
    this.imageLoaded = false;
  }

  _createClass(CircleImageBase, [{
    key: 'setOptions',
    value: function setOptions(options, imageObj) {
      this.options = options;
      if (imageObj) {
        this.imageObj = imageObj;
      }
    }

    /**
     * This function resizes the image by the options size when the image has not yet loaded. If the image has loaded, we
     * force the update of the size again.
     *
     * @private
     */
  }, {
    key: '_resizeImage',
    value: function _resizeImage() {
      var force = false;
      if (!this.imageObj.width || !this.imageObj.height) {
        // undefined or 0
        this.imageLoaded = false;
      } else if (this.imageLoaded === false) {
        this.imageLoaded = true;
        force = true;
      }

      if (!this.width || !this.height || force === true) {
        // undefined or 0
        var width, height, ratio;
        if (this.imageObj.width && this.imageObj.height) {
          // not undefined or 0
          width = 0;
          height = 0;
        }
        if (this.options.shapeProperties.useImageSize === false) {
          if (this.imageObj.width > this.imageObj.height) {
            ratio = this.imageObj.width / this.imageObj.height;
            width = this.options.size * 2 * ratio || this.imageObj.width;
            height = this.options.size * 2 || this.imageObj.height;
          } else {
            if (this.imageObj.width && this.imageObj.height) {
              // not undefined or 0
              ratio = this.imageObj.height / this.imageObj.width;
            } else {
              ratio = 1;
            }
            width = this.options.size * 2;
            height = this.options.size * 2 * ratio;
          }
        } else {
          // when not using the size property, we use the image size
          width = this.imageObj.width;
          height = this.imageObj.height;
        }
        this.width = width;
        this.height = height;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: '_drawRawCircle',
    value: function _drawRawCircle(ctx, x, y, selected, hover, size) {
      var borderWidth = this.options.borderWidth;
      var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

      ctx.strokeStyle = selected ? this.options.color.highlight.border : hover ? this.options.color.hover.border : this.options.color.border;

      ctx.lineWidth = selected ? selectionLineWidth : borderWidth;
      ctx.lineWidth *= this.networkScaleInv;
      ctx.lineWidth = Math.min(this.width, ctx.lineWidth);
      ctx.fillStyle = selected ? this.options.color.highlight.background : hover ? this.options.color.hover.background : this.options.color.background;
      ctx.circle(x, y, size);

      // draw shadow if enabled
      this.enableShadow(ctx);
      // draw the background
      ctx.fill();
      // disable shadows for other elements.
      this.disableShadow(ctx);

      //draw dashed border if enabled, save and restore is required for firefox not to crash on unix.
      ctx.save();
      this.enableBorderDashes(ctx);
      //draw the border
      ctx.stroke();
      //disable dashed border for other elements
      this.disableBorderDashes(ctx);
      ctx.restore();
    }
  }, {
    key: '_drawImageAtPosition',
    value: function _drawImageAtPosition(ctx) {
      if (this.imageObj.width != 0) {
        // draw the image
        ctx.globalAlpha = 1.0;

        // draw shadow if enabled
        this.enableShadow(ctx);

        // draw image
        ctx.drawImage(this.imageObj, this.left, this.top, this.width, this.height);

        // disable shadows for other elements.
        this.disableShadow(ctx);
      }
    }
  }, {
    key: '_drawImageLabel',
    value: function _drawImageLabel(ctx, x, y, selected) {
      var yLabel;
      var offset = 0;

      if (this.height !== undefined) {
        offset = this.height * 0.5;
        var labelDimensions = this.labelModule.getTextSize(ctx);
        if (labelDimensions.lineCount >= 1) {
          offset += labelDimensions.height / 2;
        }
      }

      yLabel = y + offset;

      if (this.options.label) {
        this.labelOffset = offset;
      }
      this.labelModule.draw(ctx, x, yLabel, selected, 'hanging');
    }
  }]);

  return CircleImageBase;
})(_utilNodeBase2['default']);

exports['default'] = CircleImageBase;
module.exports = exports['default'];

},{"../util/NodeBase":56}],56:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var NodeBase = (function () {
  function NodeBase(options, body, labelModule) {
    _classCallCheck(this, NodeBase);

    this.body = body;
    this.labelModule = labelModule;
    this.setOptions(options);
    this.top = undefined;
    this.left = undefined;
    this.height = undefined;
    this.width = undefined;
    this.radius = undefined;
    this.boundingBox = { top: 0, left: 0, right: 0, bottom: 0 };
  }

  _createClass(NodeBase, [{
    key: 'setOptions',
    value: function setOptions(options) {
      this.options = options;
    }
  }, {
    key: '_distanceToBorder',
    value: function _distanceToBorder(ctx, angle) {
      var borderWidth = 1;
      this.resize(ctx);
      return Math.min(Math.abs(this.width / 2 / Math.cos(angle)), Math.abs(this.height / 2 / Math.sin(angle))) + borderWidth;
    }
  }, {
    key: 'enableShadow',
    value: function enableShadow(ctx) {
      if (this.options.shadow.enabled === true) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = this.options.shadow.size;
        ctx.shadowOffsetX = this.options.shadow.x;
        ctx.shadowOffsetY = this.options.shadow.y;
      }
    }
  }, {
    key: 'disableShadow',
    value: function disableShadow(ctx) {
      if (this.options.shadow.enabled === true) {
        ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }
  }, {
    key: 'enableBorderDashes',
    value: function enableBorderDashes(ctx) {
      if (this.options.shapeProperties.borderDashes !== false) {
        if (ctx.setLineDash !== undefined) {
          var dashes = this.options.shapeProperties.borderDashes;
          if (dashes === true) {
            dashes = [5, 15];
          }
          ctx.setLineDash(dashes);
        } else {
          console.warn("setLineDash is not supported in this browser. The dashed borders cannot be used.");
          this.options.shapeProperties.borderDashes = false;
        }
      }
    }
  }, {
    key: 'disableBorderDashes',
    value: function disableBorderDashes(ctx) {
      if (this.options.shapeProperties.borderDashes !== false) {
        if (ctx.setLineDash !== undefined) {
          ctx.setLineDash([0]);
        } else {
          console.warn("setLineDash is not supported in this browser. The dashed borders cannot be used.");
          this.options.shapeProperties.borderDashes = false;
        }
      }
    }
  }]);

  return NodeBase;
})();

exports['default'] = NodeBase;
module.exports = exports['default'];

},{}],57:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utilNodeBase = require('../util/NodeBase');

var _utilNodeBase2 = _interopRequireDefault(_utilNodeBase);

var ShapeBase = (function (_NodeBase) {
  _inherits(ShapeBase, _NodeBase);

  function ShapeBase(options, body, labelModule) {
    _classCallCheck(this, ShapeBase);

    _get(Object.getPrototypeOf(ShapeBase.prototype), 'constructor', this).call(this, options, body, labelModule);
  }

  _createClass(ShapeBase, [{
    key: '_resizeShape',
    value: function _resizeShape() {
      if (this.width === undefined) {
        var size = 2 * this.options.size;
        this.width = size;
        this.height = size;
        this.radius = 0.5 * this.width;
      }
    }
  }, {
    key: '_drawShape',
    value: function _drawShape(ctx, shape, sizeMultiplier, x, y, selected, hover) {
      this._resizeShape();

      this.left = x - this.width / 2;
      this.top = y - this.height / 2;

      var borderWidth = this.options.borderWidth;
      var selectionLineWidth = this.options.borderWidthSelected || 2 * this.options.borderWidth;

      ctx.strokeStyle = selected ? this.options.color.highlight.border : hover ? this.options.color.hover.border : this.options.color.border;
      ctx.lineWidth = selected ? selectionLineWidth : borderWidth;
      ctx.lineWidth /= this.body.view.scale;
      ctx.lineWidth = Math.min(this.width, ctx.lineWidth);
      ctx.fillStyle = selected ? this.options.color.highlight.background : hover ? this.options.color.hover.background : this.options.color.background;
      ctx[shape](x, y, this.options.size);

      // draw shadow if enabled
      this.enableShadow(ctx);
      // draw the background
      ctx.fill();
      // disable shadows for other elements.
      this.disableShadow(ctx);

      //draw dashed border if enabled, save and restore is required for firefox not to crash on unix.
      ctx.save();
      this.enableBorderDashes(ctx);
      //draw the border
      ctx.stroke();
      //disable dashed border for other elements
      this.disableBorderDashes(ctx);
      ctx.restore();

      if (this.options.label !== undefined) {
        var yLabel = y + 0.5 * this.height + 3; // the + 3 is to offset it a bit below the node.
        this.labelModule.draw(ctx, x, yLabel, selected, 'hanging');
      }

      this.updateBoundingBox(x, y);
    }
  }, {
    key: 'updateBoundingBox',
    value: function updateBoundingBox(x, y) {
      this.boundingBox.top = y - this.options.size;
      this.boundingBox.left = x - this.options.size;
      this.boundingBox.right = x + this.options.size;
      this.boundingBox.bottom = y + this.options.size;

      if (this.options.label !== undefined && this.labelModule.size.width > 0) {
        this.boundingBox.left = Math.min(this.boundingBox.left, this.labelModule.size.left);
        this.boundingBox.right = Math.max(this.boundingBox.right, this.labelModule.size.left + this.labelModule.size.width);
        this.boundingBox.bottom = Math.max(this.boundingBox.bottom, this.boundingBox.bottom + this.labelModule.size.height + 3);
      }
    }
  }]);

  return ShapeBase;
})(_utilNodeBase2['default']);

exports['default'] = ShapeBase;
module.exports = exports['default'];

},{"../util/NodeBase":56}],58:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var BarnesHutSolver = (function () {
  function BarnesHutSolver(body, physicsBody, options) {
    _classCallCheck(this, BarnesHutSolver);

    this.body = body;
    this.physicsBody = physicsBody;
    this.barnesHutTree;
    this.setOptions(options);
    this.randomSeed = 5;

    // debug: show grid
    //this.body.emitter.on("afterDrawing", (ctx) => {this._debug(ctx,'#ff0000')})
  }

  _createClass(BarnesHutSolver, [{
    key: "setOptions",
    value: function setOptions(options) {
      this.options = options;
      this.thetaInversed = 1 / this.options.theta;
      this.overlapAvoidanceFactor = 1 - Math.max(0, Math.min(1, this.options.avoidOverlap)); // if 1 then min distance = 0.5, if 0.5 then min distance = 0.5 + 0.5*node.shape.radius
    }
  }, {
    key: "seededRandom",
    value: function seededRandom() {
      var x = Math.sin(this.randomSeed++) * 10000;
      return x - Math.floor(x);
    }

    /**
     * This function calculates the forces the nodes apply on eachother based on a gravitational model.
     * The Barnes Hut method is used to speed up this N-body simulation.
     *
     * @private
     */
  }, {
    key: "solve",
    value: function solve() {
      if (this.options.gravitationalConstant !== 0 && this.physicsBody.physicsNodeIndices.length > 0) {
        var node = undefined;
        var nodes = this.body.nodes;
        var nodeIndices = this.physicsBody.physicsNodeIndices;
        var nodeCount = nodeIndices.length;

        // create the tree
        var barnesHutTree = this._formBarnesHutTree(nodes, nodeIndices);

        // for debugging
        this.barnesHutTree = barnesHutTree;

        // place the nodes one by one recursively
        for (var i = 0; i < nodeCount; i++) {
          node = nodes[nodeIndices[i]];
          if (node.options.mass > 0) {
            // starting with root is irrelevant, it never passes the BarnesHutSolver condition
            this._getForceContribution(barnesHutTree.root.children.NW, node);
            this._getForceContribution(barnesHutTree.root.children.NE, node);
            this._getForceContribution(barnesHutTree.root.children.SW, node);
            this._getForceContribution(barnesHutTree.root.children.SE, node);
          }
        }
      }
    }

    /**
     * This function traverses the barnesHutTree. It checks when it can approximate distant nodes with their center of mass.
     * If a region contains a single node, we check if it is not itself, then we apply the force.
     *
     * @param parentBranch
     * @param node
     * @private
     */
  }, {
    key: "_getForceContribution",
    value: function _getForceContribution(parentBranch, node) {
      // we get no force contribution from an empty region
      if (parentBranch.childrenCount > 0) {
        var dx = undefined,
            dy = undefined,
            distance = undefined;

        // get the distance from the center of mass to the node.
        dx = parentBranch.centerOfMass.x - node.x;
        dy = parentBranch.centerOfMass.y - node.y;
        distance = Math.sqrt(dx * dx + dy * dy);

        // BarnesHutSolver condition
        // original condition : s/d < theta = passed  ===  d/s > 1/theta = passed
        // calcSize = 1/s --> d * 1/s > 1/theta = passed
        if (distance * parentBranch.calcSize > this.thetaInversed) {
          this._calculateForces(distance, dx, dy, node, parentBranch);
        } else {
          // Did not pass the condition, go into children if available
          if (parentBranch.childrenCount === 4) {
            this._getForceContribution(parentBranch.children.NW, node);
            this._getForceContribution(parentBranch.children.NE, node);
            this._getForceContribution(parentBranch.children.SW, node);
            this._getForceContribution(parentBranch.children.SE, node);
          } else {
            // parentBranch must have only one node, if it was empty we wouldnt be here
            if (parentBranch.children.data.id != node.id) {
              // if it is not self
              this._calculateForces(distance, dx, dy, node, parentBranch);
            }
          }
        }
      }
    }

    /**
     * Calculate the forces based on the distance.
     *
     * @param distance
     * @param dx
     * @param dy
     * @param node
     * @param parentBranch
     * @private
     */
  }, {
    key: "_calculateForces",
    value: function _calculateForces(distance, dx, dy, node, parentBranch) {
      if (distance === 0) {
        distance = 0.1;
        dx = distance;
      }

      if (this.overlapAvoidanceFactor < 1) {
        distance = Math.max(0.1 + this.overlapAvoidanceFactor * node.shape.radius, distance - node.shape.radius);
      }

      // the dividing by the distance cubed instead of squared allows us to get the fx and fy components without sines and cosines
      // it is shorthand for gravityforce with distance squared and fx = dx/distance * gravityForce
      var gravityForce = this.options.gravitationalConstant * parentBranch.mass * node.options.mass / Math.pow(distance, 3);
      var fx = dx * gravityForce;
      var fy = dy * gravityForce;

      this.physicsBody.forces[node.id].x += fx;
      this.physicsBody.forces[node.id].y += fy;
    }

    /**
     * This function constructs the barnesHut tree recursively. It creates the root, splits it and starts placing the nodes.
     *
     * @param nodes
     * @param nodeIndices
     * @private
     */
  }, {
    key: "_formBarnesHutTree",
    value: function _formBarnesHutTree(nodes, nodeIndices) {
      var node = undefined;
      var nodeCount = nodeIndices.length;

      var minX = nodes[nodeIndices[0]].x;
      var minY = nodes[nodeIndices[0]].y;
      var maxX = nodes[nodeIndices[0]].x;
      var maxY = nodes[nodeIndices[0]].y;

      // get the range of the nodes
      for (var i = 1; i < nodeCount; i++) {
        var x = nodes[nodeIndices[i]].x;
        var y = nodes[nodeIndices[i]].y;
        if (nodes[nodeIndices[i]].options.mass > 0) {
          if (x < minX) {
            minX = x;
          }
          if (x > maxX) {
            maxX = x;
          }
          if (y < minY) {
            minY = y;
          }
          if (y > maxY) {
            maxY = y;
          }
        }
      }
      // make the range a square
      var sizeDiff = Math.abs(maxX - minX) - Math.abs(maxY - minY); // difference between X and Y
      if (sizeDiff > 0) {
        minY -= 0.5 * sizeDiff;
        maxY += 0.5 * sizeDiff;
      } // xSize > ySize
      else {
          minX += 0.5 * sizeDiff;
          maxX -= 0.5 * sizeDiff;
        } // xSize < ySize

      var minimumTreeSize = 1e-5;
      var rootSize = Math.max(minimumTreeSize, Math.abs(maxX - minX));
      var halfRootSize = 0.5 * rootSize;
      var centerX = 0.5 * (minX + maxX),
          centerY = 0.5 * (minY + maxY);

      // construct the barnesHutTree
      var barnesHutTree = {
        root: {
          centerOfMass: { x: 0, y: 0 },
          mass: 0,
          range: {
            minX: centerX - halfRootSize, maxX: centerX + halfRootSize,
            minY: centerY - halfRootSize, maxY: centerY + halfRootSize
          },
          size: rootSize,
          calcSize: 1 / rootSize,
          children: { data: null },
          maxWidth: 0,
          level: 0,
          childrenCount: 4
        }
      };
      this._splitBranch(barnesHutTree.root);

      // place the nodes one by one recursively
      for (var i = 0; i < nodeCount; i++) {
        node = nodes[nodeIndices[i]];
        if (node.options.mass > 0) {
          this._placeInTree(barnesHutTree.root, node);
        }
      }

      // make global
      return barnesHutTree;
    }

    /**
     * this updates the mass of a branch. this is increased by adding a node.
     *
     * @param parentBranch
     * @param node
     * @private
     */
  }, {
    key: "_updateBranchMass",
    value: function _updateBranchMass(parentBranch, node) {
      var totalMass = parentBranch.mass + node.options.mass;
      var totalMassInv = 1 / totalMass;

      parentBranch.centerOfMass.x = parentBranch.centerOfMass.x * parentBranch.mass + node.x * node.options.mass;
      parentBranch.centerOfMass.x *= totalMassInv;

      parentBranch.centerOfMass.y = parentBranch.centerOfMass.y * parentBranch.mass + node.y * node.options.mass;
      parentBranch.centerOfMass.y *= totalMassInv;

      parentBranch.mass = totalMass;
      var biggestSize = Math.max(Math.max(node.height, node.radius), node.width);
      parentBranch.maxWidth = parentBranch.maxWidth < biggestSize ? biggestSize : parentBranch.maxWidth;
    }

    /**
     * determine in which branch the node will be placed.
     *
     * @param parentBranch
     * @param node
     * @param skipMassUpdate
     * @private
     */
  }, {
    key: "_placeInTree",
    value: function _placeInTree(parentBranch, node, skipMassUpdate) {
      if (skipMassUpdate != true || skipMassUpdate === undefined) {
        // update the mass of the branch.
        this._updateBranchMass(parentBranch, node);
      }

      if (parentBranch.children.NW.range.maxX > node.x) {
        // in NW or SW
        if (parentBranch.children.NW.range.maxY > node.y) {
          // in NW
          this._placeInRegion(parentBranch, node, "NW");
        } else {
          // in SW
          this._placeInRegion(parentBranch, node, "SW");
        }
      } else {
        // in NE or SE
        if (parentBranch.children.NW.range.maxY > node.y) {
          // in NE
          this._placeInRegion(parentBranch, node, "NE");
        } else {
          // in SE
          this._placeInRegion(parentBranch, node, "SE");
        }
      }
    }

    /**
     * actually place the node in a region (or branch)
     *
     * @param parentBranch
     * @param node
     * @param region
     * @private
     */
  }, {
    key: "_placeInRegion",
    value: function _placeInRegion(parentBranch, node, region) {
      switch (parentBranch.children[region].childrenCount) {
        case 0:
          // place node here
          parentBranch.children[region].children.data = node;
          parentBranch.children[region].childrenCount = 1;
          this._updateBranchMass(parentBranch.children[region], node);
          break;
        case 1:
          // convert into children
          // if there are two nodes exactly overlapping (on init, on opening of cluster etc.)
          // we move one node a little bit and we do not put it in the tree.
          if (parentBranch.children[region].children.data.x === node.x && parentBranch.children[region].children.data.y === node.y) {
            node.x += this.seededRandom();
            node.y += this.seededRandom();
          } else {
            this._splitBranch(parentBranch.children[region]);
            this._placeInTree(parentBranch.children[region], node);
          }
          break;
        case 4:
          // place in branch
          this._placeInTree(parentBranch.children[region], node);
          break;
      }
    }

    /**
     * this function splits a branch into 4 sub branches. If the branch contained a node, we place it in the subbranch
     * after the split is complete.
     *
     * @param parentBranch
     * @private
     */
  }, {
    key: "_splitBranch",
    value: function _splitBranch(parentBranch) {
      // if the branch is shaded with a node, replace the node in the new subset.
      var containedNode = null;
      if (parentBranch.childrenCount === 1) {
        containedNode = parentBranch.children.data;
        parentBranch.mass = 0;
        parentBranch.centerOfMass.x = 0;
        parentBranch.centerOfMass.y = 0;
      }
      parentBranch.childrenCount = 4;
      parentBranch.children.data = null;
      this._insertRegion(parentBranch, "NW");
      this._insertRegion(parentBranch, "NE");
      this._insertRegion(parentBranch, "SW");
      this._insertRegion(parentBranch, "SE");

      if (containedNode != null) {
        this._placeInTree(parentBranch, containedNode);
      }
    }

    /**
     * This function subdivides the region into four new segments.
     * Specifically, this inserts a single new segment.
     * It fills the children section of the parentBranch
     *
     * @param parentBranch
     * @param region
     * @param parentRange
     * @private
     */
  }, {
    key: "_insertRegion",
    value: function _insertRegion(parentBranch, region) {
      var minX = undefined,
          maxX = undefined,
          minY = undefined,
          maxY = undefined;
      var childSize = 0.5 * parentBranch.size;
      switch (region) {
        case "NW":
          minX = parentBranch.range.minX;
          maxX = parentBranch.range.minX + childSize;
          minY = parentBranch.range.minY;
          maxY = parentBranch.range.minY + childSize;
          break;
        case "NE":
          minX = parentBranch.range.minX + childSize;
          maxX = parentBranch.range.maxX;
          minY = parentBranch.range.minY;
          maxY = parentBranch.range.minY + childSize;
          break;
        case "SW":
          minX = parentBranch.range.minX;
          maxX = parentBranch.range.minX + childSize;
          minY = parentBranch.range.minY + childSize;
          maxY = parentBranch.range.maxY;
          break;
        case "SE":
          minX = parentBranch.range.minX + childSize;
          maxX = parentBranch.range.maxX;
          minY = parentBranch.range.minY + childSize;
          maxY = parentBranch.range.maxY;
          break;
      }

      parentBranch.children[region] = {
        centerOfMass: { x: 0, y: 0 },
        mass: 0,
        range: { minX: minX, maxX: maxX, minY: minY, maxY: maxY },
        size: 0.5 * parentBranch.size,
        calcSize: 2 * parentBranch.calcSize,
        children: { data: null },
        maxWidth: 0,
        level: parentBranch.level + 1,
        childrenCount: 0
      };
    }

    //---------------------------  DEBUGGING BELOW  ---------------------------//

    /**
     * This function is for debugging purposed, it draws the tree.
     *
     * @param ctx
     * @param color
     * @private
     */
  }, {
    key: "_debug",
    value: function _debug(ctx, color) {
      if (this.barnesHutTree !== undefined) {

        ctx.lineWidth = 1;

        this._drawBranch(this.barnesHutTree.root, ctx, color);
      }
    }

    /**
     * This function is for debugging purposes. It draws the branches recursively.
     *
     * @param branch
     * @param ctx
     * @param color
     * @private
     */
  }, {
    key: "_drawBranch",
    value: function _drawBranch(branch, ctx, color) {
      if (color === undefined) {
        color = "#FF0000";
      }

      if (branch.childrenCount === 4) {
        this._drawBranch(branch.children.NW, ctx);
        this._drawBranch(branch.children.NE, ctx);
        this._drawBranch(branch.children.SE, ctx);
        this._drawBranch(branch.children.SW, ctx);
      }
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(branch.range.minX, branch.range.minY);
      ctx.lineTo(branch.range.maxX, branch.range.minY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(branch.range.maxX, branch.range.minY);
      ctx.lineTo(branch.range.maxX, branch.range.maxY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(branch.range.maxX, branch.range.maxY);
      ctx.lineTo(branch.range.minX, branch.range.maxY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(branch.range.minX, branch.range.maxY);
      ctx.lineTo(branch.range.minX, branch.range.minY);
      ctx.stroke();

      /*
       if (branch.mass > 0) {
       ctx.circle(branch.centerOfMass.x, branch.centerOfMass.y, 3*branch.mass);
       ctx.stroke();
       }
       */
    }
  }]);

  return BarnesHutSolver;
})();

exports["default"] = BarnesHutSolver;
module.exports = exports["default"];

},{}],59:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var CentralGravitySolver = (function () {
  function CentralGravitySolver(body, physicsBody, options) {
    _classCallCheck(this, CentralGravitySolver);

    this.body = body;
    this.physicsBody = physicsBody;
    this.setOptions(options);
  }

  _createClass(CentralGravitySolver, [{
    key: "setOptions",
    value: function setOptions(options) {
      this.options = options;
    }
  }, {
    key: "solve",
    value: function solve() {
      var dx = undefined,
          dy = undefined,
          distance = undefined,
          node = undefined;
      var nodes = this.body.nodes;
      var nodeIndices = this.physicsBody.physicsNodeIndices;
      var forces = this.physicsBody.forces;

      for (var i = 0; i < nodeIndices.length; i++) {
        var nodeId = nodeIndices[i];
        node = nodes[nodeId];
        dx = -node.x;
        dy = -node.y;
        distance = Math.sqrt(dx * dx + dy * dy);

        this._calculateForces(distance, dx, dy, forces, node);
      }
    }

    /**
     * Calculate the forces based on the distance.
     * @private
     */
  }, {
    key: "_calculateForces",
    value: function _calculateForces(distance, dx, dy, forces, node) {
      var gravityForce = distance === 0 ? 0 : this.options.centralGravity / distance;
      forces[node.id].x = dx * gravityForce;
      forces[node.id].y = dy * gravityForce;
    }
  }]);

  return CentralGravitySolver;
})();

exports["default"] = CentralGravitySolver;
module.exports = exports["default"];

},{}],60:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _CentralGravitySolver2 = require("./CentralGravitySolver");

var _CentralGravitySolver3 = _interopRequireDefault(_CentralGravitySolver2);

var ForceAtlas2BasedCentralGravitySolver = (function (_CentralGravitySolver) {
  _inherits(ForceAtlas2BasedCentralGravitySolver, _CentralGravitySolver);

  function ForceAtlas2BasedCentralGravitySolver(body, physicsBody, options) {
    _classCallCheck(this, ForceAtlas2BasedCentralGravitySolver);

    _get(Object.getPrototypeOf(ForceAtlas2BasedCentralGravitySolver.prototype), "constructor", this).call(this, body, physicsBody, options);
  }

  /**
   * Calculate the forces based on the distance.
   * @private
   */

  _createClass(ForceAtlas2BasedCentralGravitySolver, [{
    key: "_calculateForces",
    value: function _calculateForces(distance, dx, dy, forces, node) {
      if (distance > 0) {
        var degree = node.edges.length + 1;
        var gravityForce = this.options.centralGravity * degree * node.options.mass;
        forces[node.id].x = dx * gravityForce;
        forces[node.id].y = dy * gravityForce;
      }
    }
  }]);

  return ForceAtlas2BasedCentralGravitySolver;
})(_CentralGravitySolver3["default"]);

exports["default"] = ForceAtlas2BasedCentralGravitySolver;
module.exports = exports["default"];

},{"./CentralGravitySolver":59}],61:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _BarnesHutSolver2 = require("./BarnesHutSolver");

var _BarnesHutSolver3 = _interopRequireDefault(_BarnesHutSolver2);

var ForceAtlas2BasedRepulsionSolver = (function (_BarnesHutSolver) {
  _inherits(ForceAtlas2BasedRepulsionSolver, _BarnesHutSolver);

  function ForceAtlas2BasedRepulsionSolver(body, physicsBody, options) {
    _classCallCheck(this, ForceAtlas2BasedRepulsionSolver);

    _get(Object.getPrototypeOf(ForceAtlas2BasedRepulsionSolver.prototype), "constructor", this).call(this, body, physicsBody, options);
  }

  /**
   * Calculate the forces based on the distance.
   *
   * @param distance
   * @param dx
   * @param dy
   * @param node
   * @param parentBranch
   * @private
   */

  _createClass(ForceAtlas2BasedRepulsionSolver, [{
    key: "_calculateForces",
    value: function _calculateForces(distance, dx, dy, node, parentBranch) {
      if (distance === 0) {
        distance = 0.1 * Math.random();
        dx = distance;
      }

      if (this.overlapAvoidanceFactor < 1) {
        distance = Math.max(0.1 + this.overlapAvoidanceFactor * node.shape.radius, distance - node.shape.radius);
      }

      var degree = node.edges.length + 1;
      // the dividing by the distance cubed instead of squared allows us to get the fx and fy components without sines and cosines
      // it is shorthand for gravityforce with distance squared and fx = dx/distance * gravityForce
      var gravityForce = this.options.gravitationalConstant * parentBranch.mass * node.options.mass * degree / Math.pow(distance, 2);
      var fx = dx * gravityForce;
      var fy = dy * gravityForce;

      this.physicsBody.forces[node.id].x += fx;
      this.physicsBody.forces[node.id].y += fy;
    }
  }]);

  return ForceAtlas2BasedRepulsionSolver;
})(_BarnesHutSolver3["default"]);

exports["default"] = ForceAtlas2BasedRepulsionSolver;
module.exports = exports["default"];

},{"./BarnesHutSolver":58}],62:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HierarchicalRepulsionSolver = (function () {
  function HierarchicalRepulsionSolver(body, physicsBody, options) {
    _classCallCheck(this, HierarchicalRepulsionSolver);

    this.body = body;
    this.physicsBody = physicsBody;
    this.setOptions(options);
  }

  _createClass(HierarchicalRepulsionSolver, [{
    key: "setOptions",
    value: function setOptions(options) {
      this.options = options;
    }

    /**
     * Calculate the forces the nodes apply on each other based on a repulsion field.
     * This field is linearly approximated.
     *
     * @private
     */
  }, {
    key: "solve",
    value: function solve() {
      var dx, dy, distance, fx, fy, repulsingForce, node1, node2, i, j;

      var nodes = this.body.nodes;
      var nodeIndices = this.physicsBody.physicsNodeIndices;
      var forces = this.physicsBody.forces;

      // repulsing forces between nodes
      var nodeDistance = this.options.nodeDistance;

      // we loop from i over all but the last entree in the array
      // j loops from i+1 to the last. This way we do not double count any of the indices, nor i === j
      for (i = 0; i < nodeIndices.length - 1; i++) {
        node1 = nodes[nodeIndices[i]];
        for (j = i + 1; j < nodeIndices.length; j++) {
          node2 = nodes[nodeIndices[j]];

          // nodes only affect nodes on their level
          if (node1.level === node2.level) {
            dx = node2.x - node1.x;
            dy = node2.y - node1.y;
            distance = Math.sqrt(dx * dx + dy * dy);

            var steepness = 0.05;
            if (distance < nodeDistance) {
              repulsingForce = -Math.pow(steepness * distance, 2) + Math.pow(steepness * nodeDistance, 2);
            } else {
              repulsingForce = 0;
            }
            // normalize force with
            if (distance === 0) {
              distance = 0.01;
            } else {
              repulsingForce = repulsingForce / distance;
            }
            fx = dx * repulsingForce;
            fy = dy * repulsingForce;

            forces[node1.id].x -= fx;
            forces[node1.id].y -= fy;
            forces[node2.id].x += fx;
            forces[node2.id].y += fy;
          }
        }
      }
    }
  }]);

  return HierarchicalRepulsionSolver;
})();

exports["default"] = HierarchicalRepulsionSolver;
module.exports = exports["default"];

},{}],63:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HierarchicalSpringSolver = (function () {
  function HierarchicalSpringSolver(body, physicsBody, options) {
    _classCallCheck(this, HierarchicalSpringSolver);

    this.body = body;
    this.physicsBody = physicsBody;
    this.setOptions(options);
  }

  _createClass(HierarchicalSpringSolver, [{
    key: "setOptions",
    value: function setOptions(options) {
      this.options = options;
    }

    /**
     * This function calculates the springforces on the nodes, accounting for the support nodes.
     *
     * @private
     */
  }, {
    key: "solve",
    value: function solve() {
      var edgeLength, edge;
      var dx, dy, fx, fy, springForce, distance;
      var edges = this.body.edges;
      var factor = 0.5;

      var edgeIndices = this.physicsBody.physicsEdgeIndices;
      var nodeIndices = this.physicsBody.physicsNodeIndices;
      var forces = this.physicsBody.forces;

      // initialize the spring force counters
      for (var i = 0; i < nodeIndices.length; i++) {
        var nodeId = nodeIndices[i];
        forces[nodeId].springFx = 0;
        forces[nodeId].springFy = 0;
      }

      // forces caused by the edges, modelled as springs
      for (var i = 0; i < edgeIndices.length; i++) {
        edge = edges[edgeIndices[i]];
        if (edge.connected === true) {
          edgeLength = edge.options.length === undefined ? this.options.springLength : edge.options.length;

          dx = edge.from.x - edge.to.x;
          dy = edge.from.y - edge.to.y;
          distance = Math.sqrt(dx * dx + dy * dy);
          distance = distance === 0 ? 0.01 : distance;

          // the 1/distance is so the fx and fy can be calculated without sine or cosine.
          springForce = this.options.springConstant * (edgeLength - distance) / distance;

          fx = dx * springForce;
          fy = dy * springForce;

          if (edge.to.level != edge.from.level) {
            if (forces[edge.toId] !== undefined) {
              forces[edge.toId].springFx -= fx;
              forces[edge.toId].springFy -= fy;
            }
            if (forces[edge.fromId] !== undefined) {
              forces[edge.fromId].springFx += fx;
              forces[edge.fromId].springFy += fy;
            }
          } else {
            if (forces[edge.toId] !== undefined) {
              forces[edge.toId].x -= factor * fx;
              forces[edge.toId].y -= factor * fy;
            }
            if (forces[edge.fromId] !== undefined) {
              forces[edge.fromId].x += factor * fx;
              forces[edge.fromId].y += factor * fy;
            }
          }
        }
      }

      // normalize spring forces
      var springForce = 1;
      var springFx, springFy;
      for (var i = 0; i < nodeIndices.length; i++) {
        var nodeId = nodeIndices[i];
        springFx = Math.min(springForce, Math.max(-springForce, forces[nodeId].springFx));
        springFy = Math.min(springForce, Math.max(-springForce, forces[nodeId].springFy));

        forces[nodeId].x += springFx;
        forces[nodeId].y += springFy;
      }

      // retain energy balance
      var totalFx = 0;
      var totalFy = 0;
      for (var i = 0; i < nodeIndices.length; i++) {
        var nodeId = nodeIndices[i];
        totalFx += forces[nodeId].x;
        totalFy += forces[nodeId].y;
      }
      var correctionFx = totalFx / nodeIndices.length;
      var correctionFy = totalFy / nodeIndices.length;

      for (var i = 0; i < nodeIndices.length; i++) {
        var nodeId = nodeIndices[i];
        forces[nodeId].x -= correctionFx;
        forces[nodeId].y -= correctionFy;
      }
    }
  }]);

  return HierarchicalSpringSolver;
})();

exports["default"] = HierarchicalSpringSolver;
module.exports = exports["default"];

},{}],64:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RepulsionSolver = (function () {
  function RepulsionSolver(body, physicsBody, options) {
    _classCallCheck(this, RepulsionSolver);

    this.body = body;
    this.physicsBody = physicsBody;
    this.setOptions(options);
  }

  _createClass(RepulsionSolver, [{
    key: "setOptions",
    value: function setOptions(options) {
      this.options = options;
    }

    /**
     * Calculate the forces the nodes apply on each other based on a repulsion field.
     * This field is linearly approximated.
     *
     * @private
     */
  }, {
    key: "solve",
    value: function solve() {
      var dx, dy, distance, fx, fy, repulsingForce, node1, node2;

      var nodes = this.body.nodes;
      var nodeIndices = this.physicsBody.physicsNodeIndices;
      var forces = this.physicsBody.forces;

      // repulsing forces between nodes
      var nodeDistance = this.options.nodeDistance;

      // approximation constants
      var a = -2 / 3 / nodeDistance;
      var b = 4 / 3;

      // we loop from i over all but the last entree in the array
      // j loops from i+1 to the last. This way we do not double count any of the indices, nor i === j
      for (var i = 0; i < nodeIndices.length - 1; i++) {
        node1 = nodes[nodeIndices[i]];
        for (var j = i + 1; j < nodeIndices.length; j++) {
          node2 = nodes[nodeIndices[j]];

          dx = node2.x - node1.x;
          dy = node2.y - node1.y;
          distance = Math.sqrt(dx * dx + dy * dy);

          // same condition as BarnesHutSolver, making sure nodes are never 100% overlapping.
          if (distance === 0) {
            distance = 0.1 * Math.random();
            dx = distance;
          }

          if (distance < 2 * nodeDistance) {
            if (distance < 0.5 * nodeDistance) {
              repulsingForce = 1.0;
            } else {
              repulsingForce = a * distance + b; // linear approx of  1 / (1 + Math.exp((distance / nodeDistance - 1) * steepness))
            }
            repulsingForce = repulsingForce / distance;

            fx = dx * repulsingForce;
            fy = dy * repulsingForce;

            forces[node1.id].x -= fx;
            forces[node1.id].y -= fy;
            forces[node2.id].x += fx;
            forces[node2.id].y += fy;
          }
        }
      }
    }
  }]);

  return RepulsionSolver;
})();

exports["default"] = RepulsionSolver;
module.exports = exports["default"];

},{}],65:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SpringSolver = (function () {
  function SpringSolver(body, physicsBody, options) {
    _classCallCheck(this, SpringSolver);

    this.body = body;
    this.physicsBody = physicsBody;
    this.setOptions(options);
  }

  _createClass(SpringSolver, [{
    key: "setOptions",
    value: function setOptions(options) {
      this.options = options;
    }

    /**
     * This function calculates the springforces on the nodes, accounting for the support nodes.
     *
     * @private
     */
  }, {
    key: "solve",
    value: function solve() {
      var edgeLength = undefined,
          edge = undefined;
      var edgeIndices = this.physicsBody.physicsEdgeIndices;
      var edges = this.body.edges;
      var node1 = undefined,
          node2 = undefined,
          node3 = undefined;

      // forces caused by the edges, modelled as springs
      for (var i = 0; i < edgeIndices.length; i++) {
        edge = edges[edgeIndices[i]];
        if (edge.connected === true && edge.toId !== edge.fromId) {
          // only calculate forces if nodes are in the same sector
          if (this.body.nodes[edge.toId] !== undefined && this.body.nodes[edge.fromId] !== undefined) {
            if (edge.edgeType.via !== undefined) {
              edgeLength = edge.options.length === undefined ? this.options.springLength : edge.options.length;
              node1 = edge.to;
              node2 = edge.edgeType.via;
              node3 = edge.from;

              this._calculateSpringForce(node1, node2, 0.5 * edgeLength);
              this._calculateSpringForce(node2, node3, 0.5 * edgeLength);
            } else {
              // the * 1.5 is here so the edge looks as large as a smooth edge. It does not initially because the smooth edges use
              // the support nodes which exert a repulsive force on the to and from nodes, making the edge appear larger.
              edgeLength = edge.options.length === undefined ? this.options.springLength * 1.5 : edge.options.length;
              this._calculateSpringForce(edge.from, edge.to, edgeLength);
            }
          }
        }
      }
    }

    /**
     * This is the code actually performing the calculation for the function above.
     *
     * @param node1
     * @param node2
     * @param edgeLength
     * @private
     */
  }, {
    key: "_calculateSpringForce",
    value: function _calculateSpringForce(node1, node2, edgeLength) {
      var dx = node1.x - node2.x;
      var dy = node1.y - node2.y;
      var distance = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);

      // the 1/distance is so the fx and fy can be calculated without sine or cosine.
      var springForce = this.options.springConstant * (edgeLength - distance) / distance;

      var fx = dx * springForce;
      var fy = dy * springForce;

      // handle the case where one node is not part of the physcis
      if (this.physicsBody.forces[node1.id] !== undefined) {
        this.physicsBody.forces[node1.id].x += fx;
        this.physicsBody.forces[node1.id].y += fy;
      }

      if (this.physicsBody.forces[node2.id] !== undefined) {
        this.physicsBody.forces[node2.id].x -= fx;
        this.physicsBody.forces[node2.id].y -= fy;
      }
    }
  }]);

  return SpringSolver;
})();

exports["default"] = SpringSolver;
module.exports = exports["default"];

},{}],66:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var util = require('../../../../util');

var Label = (function () {
  function Label(body, options) {
    _classCallCheck(this, Label);

    this.body = body;

    this.pointToSelf = false;
    this.baseSize = undefined;
    this.fontOptions = {};
    this.setOptions(options);
    this.size = { top: 0, left: 0, width: 0, height: 0, yLine: 0 }; // could be cached
  }

  _createClass(Label, [{
    key: 'setOptions',
    value: function setOptions(options) {
      var allowDeletion = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      this.nodeOptions = options;

      // We want to keep the font options seperated from the node options.
      // The node options have to mirror the globals when they are not overruled.
      this.fontOptions = util.deepExtend({}, options.font, true);

      if (options.label !== undefined) {
        this.labelDirty = true;
      }

      if (options.font !== undefined) {
        Label.parseOptions(this.fontOptions, options, allowDeletion);
        if (typeof options.font === 'string') {
          this.baseSize = this.fontOptions.size;
        } else if (typeof options.font === 'object') {
          if (options.font.size !== undefined) {
            this.baseSize = options.font.size;
          }
        }
      }
    }
  }, {
    key: 'draw',

    /**
     * Main function. This is called from anything that wants to draw a label.
     * @param ctx
     * @param x
     * @param y
     * @param selected
     * @param baseline
     */
    value: function draw(ctx, x, y, selected) {
      var baseline = arguments.length <= 4 || arguments[4] === undefined ? 'middle' : arguments[4];

      // if no label, return
      if (this.nodeOptions.label === undefined) return;

      // check if we have to render the label
      var viewFontSize = this.fontOptions.size * this.body.view.scale;
      if (this.nodeOptions.label && viewFontSize < this.nodeOptions.scaling.label.drawThreshold - 1) return;

      // update the size cache if required
      this.calculateLabelSize(ctx, selected, x, y, baseline);

      // create the fontfill background
      this._drawBackground(ctx);
      // draw text
      this._drawText(ctx, selected, x, y, baseline);
    }

    /**
     * Draws the label background
     * @param {CanvasRenderingContext2D} ctx
     * @private
     */
  }, {
    key: '_drawBackground',
    value: function _drawBackground(ctx) {
      if (this.fontOptions.background !== undefined && this.fontOptions.background !== "none") {
        ctx.fillStyle = this.fontOptions.background;

        var lineMargin = 2;

        switch (this.fontOptions.align) {
          case 'middle':
            ctx.fillRect(-this.size.width * 0.5, -this.size.height * 0.5, this.size.width, this.size.height);
            break;
          case 'top':
            ctx.fillRect(-this.size.width * 0.5, -(this.size.height + lineMargin), this.size.width, this.size.height);
            break;
          case 'bottom':
            ctx.fillRect(-this.size.width * 0.5, lineMargin, this.size.width, this.size.height);
            break;
          default:
            ctx.fillRect(this.size.left, this.size.top - 0.5 * lineMargin, this.size.width, this.size.height);
            break;
        }
      }
    }

    /**
     *
     * @param ctx
     * @param x
     * @param baseline
     * @private
     */
  }, {
    key: '_drawText',
    value: function _drawText(ctx, selected, x, y) {
      var baseline = arguments.length <= 4 || arguments[4] === undefined ? 'middle' : arguments[4];

      var fontSize = this.fontOptions.size;
      var viewFontSize = fontSize * this.body.view.scale;
      // this ensures that there will not be HUGE letters on screen by setting an upper limit on the visible text size (regardless of zoomLevel)
      if (viewFontSize >= this.nodeOptions.scaling.label.maxVisible) {
        fontSize = Number(this.nodeOptions.scaling.label.maxVisible) / this.body.view.scale;
      }

      var yLine = this.size.yLine;

      var _getColor2 = this._getColor(viewFontSize);

      var _getColor22 = _slicedToArray(_getColor2, 2);

      var fontColor = _getColor22[0];
      var strokeColor = _getColor22[1];

      // configure context for drawing the text

      var _setAlignment2 = this._setAlignment(ctx, x, yLine, baseline);

      var _setAlignment22 = _slicedToArray(_setAlignment2, 2);

      x = _setAlignment22[0];
      yLine = _setAlignment22[1];
      ctx.font = (selected && this.nodeOptions.labelHighlightBold ? 'bold ' : '') + fontSize + "px " + this.fontOptions.face;
      ctx.fillStyle = fontColor;
      ctx.textAlign = 'center';

      // set the strokeWidth
      if (this.fontOptions.strokeWidth > 0) {
        ctx.lineWidth = this.fontOptions.strokeWidth;
        ctx.strokeStyle = strokeColor;
        ctx.lineJoin = 'round';
      }

      // draw the text
      for (var i = 0; i < this.lineCount; i++) {
        if (this.fontOptions.strokeWidth > 0) {
          ctx.strokeText(this.lines[i], x, yLine);
        }
        ctx.fillText(this.lines[i], x, yLine);
        yLine += fontSize;
      }
    }
  }, {
    key: '_setAlignment',
    value: function _setAlignment(ctx, x, yLine, baseline) {
      // check for label alignment (for edges)
      // TODO: make alignment for nodes
      if (this.fontOptions.align !== 'horizontal' && this.pointToSelf === false) {
        x = 0;
        yLine = 0;

        var lineMargin = 2;
        if (this.fontOptions.align === 'top') {
          ctx.textBaseline = 'alphabetic';
          yLine -= 2 * lineMargin; // distance from edge, required because we use alphabetic. Alphabetic has less difference between browsers
        } else if (this.fontOptions.align === 'bottom') {
            ctx.textBaseline = 'hanging';
            yLine += 2 * lineMargin; // distance from edge, required because we use hanging. Hanging has less difference between browsers
          } else {
              ctx.textBaseline = 'middle';
            }
      } else {
        ctx.textBaseline = baseline;
      }

      return [x, yLine];
    }

    /**
     * fade in when relative scale is between threshold and threshold - 1.
     * If the relative scale would be smaller than threshold -1 the draw function would have returned before coming here.
     *
     * @param viewFontSize
     * @returns {*[]}
     * @private
     */
  }, {
    key: '_getColor',
    value: function _getColor(viewFontSize) {
      var fontColor = this.fontOptions.color || '#000000';
      var strokeColor = this.fontOptions.strokeColor || '#ffffff';
      if (viewFontSize <= this.nodeOptions.scaling.label.drawThreshold) {
        var opacity = Math.max(0, Math.min(1, 1 - (this.nodeOptions.scaling.label.drawThreshold - viewFontSize)));
        fontColor = util.overrideOpacity(fontColor, opacity);
        strokeColor = util.overrideOpacity(strokeColor, opacity);
      }
      return [fontColor, strokeColor];
    }

    /**
     *
     * @param ctx
     * @param selected
     * @returns {{width: number, height: number}}
     */
  }, {
    key: 'getTextSize',
    value: function getTextSize(ctx) {
      var selected = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      var size = {
        width: this._processLabel(ctx, selected),
        height: this.fontOptions.size * this.lineCount,
        lineCount: this.lineCount
      };
      return size;
    }

    /**
     *
     * @param ctx
     * @param selected
     * @param x
     * @param y
     * @param baseline
     */
  }, {
    key: 'calculateLabelSize',
    value: function calculateLabelSize(ctx, selected) {
      var x = arguments.length <= 2 || arguments[2] === undefined ? 0 : arguments[2];
      var y = arguments.length <= 3 || arguments[3] === undefined ? 0 : arguments[3];
      var baseline = arguments.length <= 4 || arguments[4] === undefined ? 'middle' : arguments[4];

      if (this.labelDirty === true) {
        this.size.width = this._processLabel(ctx, selected);
      }
      this.size.height = this.fontOptions.size * this.lineCount;
      this.size.left = x - this.size.width * 0.5;
      this.size.top = y - this.size.height * 0.5;
      this.size.yLine = y + (1 - this.lineCount) * 0.5 * this.fontOptions.size;
      if (baseline === "hanging") {
        this.size.top += 0.5 * this.fontOptions.size;
        this.size.top += 4; // distance from node, required because we use hanging. Hanging has less difference between browsers
        this.size.yLine += 4; // distance from node
      }

      this.labelDirty = false;
    }

    /**
     * This calculates the width as well as explodes the label string and calculates the amount of lines.
     * @param ctx
     * @param selected
     * @returns {number}
     * @private
     */
  }, {
    key: '_processLabel',
    value: function _processLabel(ctx, selected) {
      var width = 0;
      var lines = [''];
      var lineCount = 0;
      if (this.nodeOptions.label !== undefined) {
        lines = String(this.nodeOptions.label).split('\n');
        lineCount = lines.length;
        ctx.font = (selected && this.nodeOptions.labelHighlightBold ? 'bold ' : '') + this.fontOptions.size + "px " + this.fontOptions.face;
        width = ctx.measureText(lines[0]).width;
        for (var i = 1; i < lineCount; i++) {
          var lineWidth = ctx.measureText(lines[i]).width;
          width = lineWidth > width ? lineWidth : width;
        }
      }
      this.lines = lines;
      this.lineCount = lineCount;

      return width;
    }
  }], [{
    key: 'parseOptions',
    value: function parseOptions(parentOptions, newOptions) {
      var allowDeletion = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

      if (typeof newOptions.font === 'string') {
        var newOptionsArray = newOptions.font.split(" ");
        parentOptions.size = newOptionsArray[0].replace("px", '');
        parentOptions.face = newOptionsArray[1];
        parentOptions.color = newOptionsArray[2];
      } else if (typeof newOptions.font === 'object') {
        util.fillIfDefined(parentOptions, newOptions.font, allowDeletion);
      }
      parentOptions.size = Number(parentOptions.size);
    }
  }]);

  return Label;
})();

exports['default'] = Label;
module.exports = exports['default'];

},{"../../../../util":73}],67:[function(require,module,exports){
/**
 * This object contains all possible options. It will check if the types are correct, if required if the option is one
 * of the allowed values.
 *
 * __any__ means that the name of the property does not matter.
 * __type__ is a required field for all objects and contains the allowed types of all objects
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
var string = 'string';
var boolean = 'boolean';
var number = 'number';
var array = 'array';
var object = 'object'; // should only be in a __type__ property
var dom = 'dom';
var any = 'any';

var allOptions = {
  configure: {
    enabled: { boolean: boolean },
    filter: { boolean: boolean, string: string, array: array, 'function': 'function' },
    container: { dom: dom },
    showButton: { boolean: boolean },
    __type__: { object: object, boolean: boolean, string: string, array: array, 'function': 'function' }
  },
  edges: {
    arrows: {
      to: { enabled: { boolean: boolean }, scaleFactor: { number: number }, __type__: { object: object, boolean: boolean } },
      middle: { enabled: { boolean: boolean }, scaleFactor: { number: number }, __type__: { object: object, boolean: boolean } },
      from: { enabled: { boolean: boolean }, scaleFactor: { number: number }, __type__: { object: object, boolean: boolean } },
      __type__: { string: ['from', 'to', 'middle'], object: object }
    },
    color: {
      color: { string: string },
      highlight: { string: string },
      hover: { string: string },
      inherit: { string: ['from', 'to', 'both'], boolean: boolean },
      opacity: { number: number },
      __type__: { object: object, string: string }
    },
    dashes: { boolean: boolean, array: array },
    font: {
      color: { string: string },
      size: { number: number }, // px
      face: { string: string },
      background: { string: string },
      strokeWidth: { number: number }, // px
      strokeColor: { string: string },
      align: { string: ['horizontal', 'top', 'middle', 'bottom'] },
      __type__: { object: object, string: string }
    },
    hidden: { boolean: boolean },
    hoverWidth: { 'function': 'function', number: number },
    label: { string: string, 'undefined': 'undefined' },
    labelHighlightBold: { boolean: boolean },
    length: { number: number, 'undefined': 'undefined' },
    physics: { boolean: boolean },
    scaling: {
      min: { number: number },
      max: { number: number },
      label: {
        enabled: { boolean: boolean },
        min: { number: number },
        max: { number: number },
        maxVisible: { number: number },
        drawThreshold: { number: number },
        __type__: { object: object, boolean: boolean }
      },
      customScalingFunction: { 'function': 'function' },
      __type__: { object: object }
    },
    selectionWidth: { 'function': 'function', number: number },
    selfReferenceSize: { number: number },
    shadow: {
      enabled: { boolean: boolean },
      size: { number: number },
      x: { number: number },
      y: { number: number },
      __type__: { object: object, boolean: boolean }
    },
    smooth: {
      enabled: { boolean: boolean },
      type: { string: ['dynamic', 'continuous', 'discrete', 'diagonalCross', 'straightCross', 'horizontal', 'vertical', 'curvedCW', 'curvedCCW', 'cubicBezier'] },
      roundness: { number: number },
      forceDirection: { string: ['horizontal', 'vertical', 'none'], boolean: boolean },
      __type__: { object: object, boolean: boolean }
    },
    title: { string: string, 'undefined': 'undefined' },
    width: { number: number },
    value: { number: number, 'undefined': 'undefined' },
    __type__: { object: object }
  },
  groups: {
    useDefaultGroups: { boolean: boolean },
    __any__: 'get from nodes, will be overwritten below',
    __type__: { object: object }
  },
  interaction: {
    dragNodes: { boolean: boolean },
    dragView: { boolean: boolean },
    hideEdgesOnDrag: { boolean: boolean },
    hideNodesOnDrag: { boolean: boolean },
    hover: { boolean: boolean },
    keyboard: {
      enabled: { boolean: boolean },
      speed: { x: { number: number }, y: { number: number }, zoom: { number: number }, __type__: { object: object } },
      bindToWindow: { boolean: boolean },
      __type__: { object: object, boolean: boolean }
    },
    multiselect: { boolean: boolean },
    navigationButtons: { boolean: boolean },
    selectable: { boolean: boolean },
    selectConnectedEdges: { boolean: boolean },
    hoverConnectedEdges: { boolean: boolean },
    tooltipDelay: { number: number },
    zoomView: { boolean: boolean },
    __type__: { object: object }
  },
  layout: {
    randomSeed: { 'undefined': 'undefined', number: number },
    improvedLayout: { boolean: boolean },
    hierarchical: {
      enabled: { boolean: boolean },
      levelSeparation: { number: number },
      direction: { string: ['UD', 'DU', 'LR', 'RL'] }, // UD, DU, LR, RL
      sortMethod: { string: ['hubsize', 'directed'] }, // hubsize, directed
      __type__: { object: object, boolean: boolean }
    },
    __type__: { object: object }
  },
  manipulation: {
    enabled: { boolean: boolean },
    initiallyActive: { boolean: boolean },
    addNode: { boolean: boolean, 'function': 'function' },
    addEdge: { boolean: boolean, 'function': 'function' },
    editNode: { 'function': 'function' },
    editEdge: { boolean: boolean, 'function': 'function' },
    deleteNode: { boolean: boolean, 'function': 'function' },
    deleteEdge: { boolean: boolean, 'function': 'function' },
    controlNodeStyle: 'get from nodes, will be overwritten below',
    __type__: { object: object, boolean: boolean }
  },
  nodes: {
    borderWidth: { number: number },
    borderWidthSelected: { number: number, 'undefined': 'undefined' },
    brokenImage: { string: string, 'undefined': 'undefined' },
    color: {
      border: { string: string },
      background: { string: string },
      highlight: {
        border: { string: string },
        background: { string: string },
        __type__: { object: object, string: string }
      },
      hover: {
        border: { string: string },
        background: { string: string },
        __type__: { object: object, string: string }
      },
      __type__: { object: object, string: string }
    },
    fixed: {
      x: { boolean: boolean },
      y: { boolean: boolean },
      __type__: { object: object, boolean: boolean }
    },
    font: {
      color: { string: string },
      size: { number: number }, // px
      face: { string: string },
      background: { string: string },
      strokeWidth: { number: number }, // px
      strokeColor: { string: string },
      __type__: { object: object, string: string }
    },
    group: { string: string, number: number, 'undefined': 'undefined' },
    hidden: { boolean: boolean },
    icon: {
      face: { string: string },
      code: { string: string }, //'\uf007',
      size: { number: number }, //50,
      color: { string: string },
      __type__: { object: object }
    },
    id: { string: string, number: number },
    image: { string: string, 'undefined': 'undefined' }, // --> URL
    label: { string: string, 'undefined': 'undefined' },
    labelHighlightBold: { boolean: boolean },
    level: { number: number, 'undefined': 'undefined' },
    mass: { number: number },
    physics: { boolean: boolean },
    scaling: {
      min: { number: number },
      max: { number: number },
      label: {
        enabled: { boolean: boolean },
        min: { number: number },
        max: { number: number },
        maxVisible: { number: number },
        drawThreshold: { number: number },
        __type__: { object: object, boolean: boolean }
      },
      customScalingFunction: { 'function': 'function' },
      __type__: { object: object }
    },
    shadow: {
      enabled: { boolean: boolean },
      size: { number: number },
      x: { number: number },
      y: { number: number },
      __type__: { object: object, boolean: boolean }
    },
    shape: { string: ['ellipse', 'circle', 'database', 'box', 'text', 'image', 'circularImage', 'diamond', 'dot', 'star', 'triangle', 'triangleDown', 'square', 'icon'] },
    shapeProperties: {
      borderDashes: { boolean: boolean, array: array },
      borderRadius: { number: number },
      useImageSize: { boolean: boolean },
      useBorderWithImage: { boolean: boolean },
      __type__: { object: object }
    },
    size: { number: number },
    title: { string: string, 'undefined': 'undefined' },
    value: { number: number, 'undefined': 'undefined' },
    x: { number: number },
    y: { number: number },
    __type__: { object: object }
  },
  physics: {
    enabled: { boolean: boolean },
    barnesHut: {
      gravitationalConstant: { number: number },
      centralGravity: { number: number },
      springLength: { number: number },
      springConstant: { number: number },
      damping: { number: number },
      avoidOverlap: { number: number },
      __type__: { object: object }
    },
    forceAtlas2Based: {
      gravitationalConstant: { number: number },
      centralGravity: { number: number },
      springLength: { number: number },
      springConstant: { number: number },
      damping: { number: number },
      avoidOverlap: { number: number },
      __type__: { object: object }
    },
    repulsion: {
      centralGravity: { number: number },
      springLength: { number: number },
      springConstant: { number: number },
      nodeDistance: { number: number },
      damping: { number: number },
      __type__: { object: object }
    },
    hierarchicalRepulsion: {
      centralGravity: { number: number },
      springLength: { number: number },
      springConstant: { number: number },
      nodeDistance: { number: number },
      damping: { number: number },
      __type__: { object: object }
    },
    maxVelocity: { number: number },
    minVelocity: { number: number }, // px/s
    solver: { string: ['barnesHut', 'repulsion', 'hierarchicalRepulsion', 'forceAtlas2Based'] },
    stabilization: {
      enabled: { boolean: boolean },
      iterations: { number: number }, // maximum number of iteration to stabilize
      updateInterval: { number: number },
      onlyDynamicEdges: { boolean: boolean },
      fit: { boolean: boolean },
      __type__: { object: object, boolean: boolean }
    },
    timestep: { number: number },
    adaptiveTimestep: { boolean: boolean },
    __type__: { object: object, boolean: boolean }
  },

  //globals :
  autoResize: { boolean: boolean },
  clickToUse: { boolean: boolean },
  locale: { string: string },
  locales: {
    __any__: { any: any },
    __type__: { object: object }
  },
  height: { string: string },
  width: { string: string },
  __type__: { object: object }
};

allOptions.groups.__any__ = allOptions.nodes;
allOptions.manipulation.controlNodeStyle = allOptions.nodes;

var configureOptions = {
  nodes: {
    borderWidth: [1, 0, 10, 1],
    borderWidthSelected: [2, 0, 10, 1],
    color: {
      border: ['color', '#2B7CE9'],
      background: ['color', '#97C2FC'],
      highlight: {
        border: ['color', '#2B7CE9'],
        background: ['color', '#D2E5FF']
      },
      hover: {
        border: ['color', '#2B7CE9'],
        background: ['color', '#D2E5FF']
      }
    },
    fixed: {
      x: false,
      y: false
    },
    font: {
      color: ['color', '#343434'],
      size: [14, 0, 100, 1], // px
      face: ['arial', 'verdana', 'tahoma'],
      background: ['color', 'none'],
      strokeWidth: [0, 0, 50, 1], // px
      strokeColor: ['color', '#ffffff']
    },
    //group: 'string',
    hidden: false,
    labelHighlightBold: true,
    //icon: {
    //  face: 'string',  //'FontAwesome',
    //  code: 'string',  //'\uf007',
    //  size: [50, 0, 200, 1],  //50,
    //  color: ['color','#2B7CE9']   //'#aa00ff'
    //},
    //image: 'string', // --> URL
    physics: true,
    scaling: {
      min: [10, 0, 200, 1],
      max: [30, 0, 200, 1],
      label: {
        enabled: false,
        min: [14, 0, 200, 1],
        max: [30, 0, 200, 1],
        maxVisible: [30, 0, 200, 1],
        drawThreshold: [5, 0, 20, 1]
      }
    },
    shadow: {
      enabled: false,
      size: [10, 0, 20, 1],
      x: [5, -30, 30, 1],
      y: [5, -30, 30, 1]
    },
    shape: ['ellipse', 'box', 'circle', 'database', 'diamond', 'dot', 'square', 'star', 'text', 'triangle', 'triangleDown'],
    shapeProperties: {
      borderDashes: false,
      borderRadius: [6, 0, 20, 1],
      useImageSize: false
    },
    size: [25, 0, 200, 1]
  },
  edges: {
    arrows: {
      to: { enabled: false, scaleFactor: [1, 0, 3, 0.05] }, // boolean / {arrowScaleFactor:1} / {enabled: false, arrowScaleFactor:1}
      middle: { enabled: false, scaleFactor: [1, 0, 3, 0.05] },
      from: { enabled: false, scaleFactor: [1, 0, 3, 0.05] }
    },
    color: {
      color: ['color', '#848484'],
      highlight: ['color', '#848484'],
      hover: ['color', '#848484'],
      inherit: ['from', 'to', 'both', true, false],
      opacity: [1, 0, 1, 0.05]
    },
    dashes: false,
    font: {
      color: ['color', '#343434'],
      size: [14, 0, 100, 1], // px
      face: ['arial', 'verdana', 'tahoma'],
      background: ['color', 'none'],
      strokeWidth: [2, 0, 50, 1], // px
      strokeColor: ['color', '#ffffff'],
      align: ['horizontal', 'top', 'middle', 'bottom']
    },
    hidden: false,
    hoverWidth: [1.5, 0, 5, 0.1],
    labelHighlightBold: true,
    physics: true,
    scaling: {
      min: [1, 0, 100, 1],
      max: [15, 0, 100, 1],
      label: {
        enabled: true,
        min: [14, 0, 200, 1],
        max: [30, 0, 200, 1],
        maxVisible: [30, 0, 200, 1],
        drawThreshold: [5, 0, 20, 1]
      }
    },
    selectionWidth: [1.5, 0, 5, 0.1],
    selfReferenceSize: [20, 0, 200, 1],
    shadow: {
      enabled: false,
      size: [10, 0, 20, 1],
      x: [5, -30, 30, 1],
      y: [5, -30, 30, 1]
    },
    smooth: {
      enabled: true,
      type: ['dynamic', 'continuous', 'discrete', 'diagonalCross', 'straightCross', 'horizontal', 'vertical', 'curvedCW', 'curvedCCW', 'cubicBezier'],
      forceDirection: ['horizontal', 'vertical', 'none'],
      roundness: [0.5, 0, 1, 0.05]
    },
    width: [1, 0, 30, 1]
  },
  layout: {
    //randomSeed: [0, 0, 500, 1],
    //improvedLayout: true,
    hierarchical: {
      enabled: false,
      levelSeparation: [150, 20, 500, 5],
      direction: ['UD', 'DU', 'LR', 'RL'], // UD, DU, LR, RL
      sortMethod: ['hubsize', 'directed'] // hubsize, directed
    }
  },
  interaction: {
    dragNodes: true,
    dragView: true,
    hideEdgesOnDrag: false,
    hideNodesOnDrag: false,
    hover: false,
    keyboard: {
      enabled: false,
      speed: { x: [10, 0, 40, 1], y: [10, 0, 40, 1], zoom: [0.02, 0, 0.1, 0.005] },
      bindToWindow: true
    },
    multiselect: false,
    navigationButtons: false,
    selectable: true,
    selectConnectedEdges: true,
    hoverConnectedEdges: true,
    tooltipDelay: [300, 0, 1000, 25],
    zoomView: true
  },
  manipulation: {
    enabled: false,
    initiallyActive: false
  },
  physics: {
    enabled: true,
    barnesHut: {
      //theta: [0.5, 0.1, 1, 0.05],
      gravitationalConstant: [-2000, -30000, 0, 50],
      centralGravity: [0.3, 0, 10, 0.05],
      springLength: [95, 0, 500, 5],
      springConstant: [0.04, 0, 1.2, 0.005],
      damping: [0.09, 0, 1, 0.01],
      avoidOverlap: [0, 0, 1, 0.01]
    },
    forceAtlas2Based: {
      //theta: [0.5, 0.1, 1, 0.05],
      gravitationalConstant: [-50, -500, 0, 1],
      centralGravity: [0.01, 0, 1, 0.005],
      springLength: [95, 0, 500, 5],
      springConstant: [0.08, 0, 1.2, 0.005],
      damping: [0.4, 0, 1, 0.01],
      avoidOverlap: [0, 0, 1, 0.01]
    },
    repulsion: {
      centralGravity: [0.2, 0, 10, 0.05],
      springLength: [200, 0, 500, 5],
      springConstant: [0.05, 0, 1.2, 0.005],
      nodeDistance: [100, 0, 500, 5],
      damping: [0.09, 0, 1, 0.01]
    },
    hierarchicalRepulsion: {
      centralGravity: [0.2, 0, 10, 0.05],
      springLength: [100, 0, 500, 5],
      springConstant: [0.01, 0, 1.2, 0.005],
      nodeDistance: [120, 0, 500, 5],
      damping: [0.09, 0, 1, 0.01]
    },
    maxVelocity: [50, 0, 150, 1],
    minVelocity: [0.1, 0.01, 0.5, 0.01],
    solver: ['barnesHut', 'forceAtlas2Based', 'repulsion', 'hierarchicalRepulsion'],
    timestep: [0.5, 0.01, 1, 0.01]
  },
  //adaptiveTimestep: true
  global: {
    locale: ['en', 'nl']
  }
};

exports.allOptions = allOptions;
exports.configureOptions = configureOptions;

},{}],68:[function(require,module,exports){
/**
 * Canvas shapes used by Network
 */
'use strict';

if (typeof CanvasRenderingContext2D !== 'undefined') {

  /**
   * Draw a circle shape
   */
  CanvasRenderingContext2D.prototype.circle = function (x, y, r) {
    this.beginPath();
    this.arc(x, y, r, 0, 2 * Math.PI, false);
    this.closePath();
  };

  /**
   * Draw a square shape
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   size, width and height of the square
   */
  CanvasRenderingContext2D.prototype.square = function (x, y, r) {
    this.beginPath();
    this.rect(x - r, y - r, r * 2, r * 2);
    this.closePath();
  };

  /**
   * Draw a triangle shape
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   radius, half the length of the sides of the triangle
   */
  CanvasRenderingContext2D.prototype.triangle = function (x, y, r) {
    // http://en.wikipedia.org/wiki/Equilateral_triangle
    this.beginPath();

    // the change in radius and the offset is here to center the shape
    r *= 1.15;
    y += 0.275 * r;

    var s = r * 2;
    var s2 = s / 2;
    var ir = Math.sqrt(3) / 6 * s; // radius of inner circle
    var h = Math.sqrt(s * s - s2 * s2); // height

    this.moveTo(x, y - (h - ir));
    this.lineTo(x + s2, y + ir);
    this.lineTo(x - s2, y + ir);
    this.lineTo(x, y - (h - ir));
    this.closePath();
  };

  /**
   * Draw a triangle shape in downward orientation
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r radius
   */
  CanvasRenderingContext2D.prototype.triangleDown = function (x, y, r) {
    // http://en.wikipedia.org/wiki/Equilateral_triangle
    this.beginPath();

    // the change in radius and the offset is here to center the shape
    r *= 1.15;
    y -= 0.275 * r;

    var s = r * 2;
    var s2 = s / 2;
    var ir = Math.sqrt(3) / 6 * s; // radius of inner circle
    var h = Math.sqrt(s * s - s2 * s2); // height

    this.moveTo(x, y + (h - ir));
    this.lineTo(x + s2, y - ir);
    this.lineTo(x - s2, y - ir);
    this.lineTo(x, y + (h - ir));
    this.closePath();
  };

  /**
   * Draw a star shape, a star with 5 points
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   radius, half the length of the sides of the triangle
   */
  CanvasRenderingContext2D.prototype.star = function (x, y, r) {
    // http://www.html5canvastutorials.com/labs/html5-canvas-star-spinner/
    this.beginPath();

    // the change in radius and the offset is here to center the shape
    r *= 0.82;
    y += 0.1 * r;

    for (var n = 0; n < 10; n++) {
      var radius = n % 2 === 0 ? r * 1.3 : r * 0.5;
      this.lineTo(x + radius * Math.sin(n * 2 * Math.PI / 10), y - radius * Math.cos(n * 2 * Math.PI / 10));
    }

    this.closePath();
  };

  /**
   * Draw a Diamond shape
   * @param {Number} x horizontal center
   * @param {Number} y vertical center
   * @param {Number} r   radius, half the length of the sides of the triangle
   */
  CanvasRenderingContext2D.prototype.diamond = function (x, y, r) {
    // http://www.html5canvastutorials.com/labs/html5-canvas-star-spinner/
    this.beginPath();

    this.lineTo(x, y + r);
    this.lineTo(x + r, y);
    this.lineTo(x, y - r);
    this.lineTo(x - r, y);

    this.closePath();
  };

  /**
   * http://stackoverflow.com/questions/1255512/how-to-draw-a-rounded-rectangle-on-html-canvas
   */
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    var r2d = Math.PI / 180;
    if (w - 2 * r < 0) {
      r = w / 2;
    } //ensure that the radius isn't too large for x
    if (h - 2 * r < 0) {
      r = h / 2;
    } //ensure that the radius isn't too large for y
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arc(x + w - r, y + r, r, r2d * 270, r2d * 360, false);
    this.lineTo(x + w, y + h - r);
    this.arc(x + w - r, y + h - r, r, 0, r2d * 90, false);
    this.lineTo(x + r, y + h);
    this.arc(x + r, y + h - r, r, r2d * 90, r2d * 180, false);
    this.lineTo(x, y + r);
    this.arc(x + r, y + r, r, r2d * 180, r2d * 270, false);
    this.closePath();
  };

  /**
   * http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas
   */
  CanvasRenderingContext2D.prototype.ellipse = function (x, y, w, h) {
    var kappa = .5522848,
        ox = w / 2 * kappa,
        // control point offset horizontal
    oy = h / 2 * kappa,
        // control point offset vertical
    xe = x + w,
        // x-end
    ye = y + h,
        // y-end
    xm = x + w / 2,
        // x-middle
    ym = y + h / 2; // y-middle

    this.beginPath();
    this.moveTo(x, ym);
    this.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    this.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
    this.closePath();
  };

  /**
   * http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas
   */
  CanvasRenderingContext2D.prototype.database = function (x, y, w, h) {
    var f = 1 / 3;
    var wEllipse = w;
    var hEllipse = h * f;

    var kappa = .5522848,
        ox = wEllipse / 2 * kappa,
        // control point offset horizontal
    oy = hEllipse / 2 * kappa,
        // control point offset vertical
    xe = x + wEllipse,
        // x-end
    ye = y + hEllipse,
        // y-end
    xm = x + wEllipse / 2,
        // x-middle
    ym = y + hEllipse / 2,
        // y-middle
    ymb = y + (h - hEllipse / 2),
        // y-midlle, bottom ellipse
    yeb = y + h; // y-end, bottom ellipse

    this.beginPath();
    this.moveTo(xe, ym);

    this.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

    this.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);

    this.lineTo(xe, ymb);

    this.bezierCurveTo(xe, ymb + oy, xm + ox, yeb, xm, yeb);
    this.bezierCurveTo(xm - ox, yeb, x, ymb + oy, x, ymb);

    this.lineTo(x, ym);
  };

  /**
   * Draw an arrow point (no line)
   */
  CanvasRenderingContext2D.prototype.arrow = function (x, y, angle, length) {
    // tail
    var xt = x - length * Math.cos(angle);
    var yt = y - length * Math.sin(angle);

    // inner tail
    var xi = x - length * 0.9 * Math.cos(angle);
    var yi = y - length * 0.9 * Math.sin(angle);

    // left
    var xl = xt + length / 3 * Math.cos(angle + 0.5 * Math.PI);
    var yl = yt + length / 3 * Math.sin(angle + 0.5 * Math.PI);

    // right
    var xr = xt + length / 3 * Math.cos(angle - 0.5 * Math.PI);
    var yr = yt + length / 3 * Math.sin(angle - 0.5 * Math.PI);

    this.beginPath();
    this.moveTo(x, y);
    this.lineTo(xl, yl);
    this.lineTo(xi, yi);
    this.lineTo(xr, yr);
    this.closePath();
  };

  /**
   * Sets up the dashedLine functionality for drawing
   * Original code came from http://stackoverflow.com/questions/4576724/dotted-stroke-in-canvas
   * @author David Jordan
   * @date 2012-08-08
   */
  CanvasRenderingContext2D.prototype.dashedLine = function (x, y, x2, y2, pattern) {
    this.beginPath();
    this.moveTo(x, y);

    var patternLength = pattern.length;
    var dx = x2 - x;
    var dy = y2 - y;
    var slope = dy / dx;
    var distRemaining = Math.sqrt(dx * dx + dy * dy);
    var patternIndex = 0;
    var draw = true;
    var xStep = 0;
    var dashLength = pattern[0];

    while (distRemaining >= 0.1) {
      dashLength = pattern[patternIndex++ % patternLength];
      if (dashLength > distRemaining) {
        dashLength = distRemaining;
      }

      xStep = Math.sqrt(dashLength * dashLength / (1 + slope * slope));
      xStep = dx < 0 ? -xStep : xStep;
      x += xStep;
      y += slope * xStep;

      if (draw === true) {
        this.lineTo(x, y);
      } else {
        this.moveTo(x, y);
      }

      distRemaining -= dashLength;
      draw = !draw;
    }
  };
}

},{}],69:[function(require,module,exports){
'use strict';

var keycharm = require('keycharm');
var Emitter = require('emitter-component');
var Hammer = require('../module/hammer');
var util = require('../util');

/**
 * Turn an element into an clickToUse element.
 * When not active, the element has a transparent overlay. When the overlay is
 * clicked, the mode is changed to active.
 * When active, the element is displayed with a blue border around it, and
 * the interactive contents of the element can be used. When clicked outside
 * the element, the elements mode is changed to inactive.
 * @param {Element} container
 * @constructor
 */
function Activator(container) {
  this.active = false;

  this.dom = {
    container: container
  };

  this.dom.overlay = document.createElement('div');
  this.dom.overlay.className = 'vis-overlay';

  this.dom.container.appendChild(this.dom.overlay);

  this.hammer = Hammer(this.dom.overlay);
  this.hammer.on('tap', this._onTapOverlay.bind(this));

  // block all touch events (except tap)
  var me = this;
  var events = ['tap', 'doubletap', 'press', 'pinch', 'pan', 'panstart', 'panmove', 'panend'];
  events.forEach(function (event) {
    me.hammer.on(event, function (event) {
      event.stopPropagation();
    });
  });

  // attach a click event to the window, in order to deactivate when clicking outside the timeline
  if (document && document.body) {
    this.onClick = function (event) {
      if (!_hasParent(event.target, container)) {
        me.deactivate();
      }
    };
    document.body.addEventListener('click', this.onClick);
  }

  if (this.keycharm !== undefined) {
    this.keycharm.destroy();
  }
  this.keycharm = keycharm();

  // keycharm listener only bounded when active)
  this.escListener = this.deactivate.bind(this);
}

// turn into an event emitter
Emitter(Activator.prototype);

// The currently active activator
Activator.current = null;

/**
 * Destroy the activator. Cleans up all created DOM and event listeners
 */
Activator.prototype.destroy = function () {
  this.deactivate();

  // remove dom
  this.dom.overlay.parentNode.removeChild(this.dom.overlay);

  // remove global event listener
  if (this.onClick) {
    document.body.removeEventListener('click', this.onClick);
  }

  // cleanup hammer instances
  this.hammer.destroy();
  this.hammer = null;
  // FIXME: cleaning up hammer instances doesn't work (Timeline not removed from memory)
};

/**
 * Activate the element
 * Overlay is hidden, element is decorated with a blue shadow border
 */
Activator.prototype.activate = function () {
  // we allow only one active activator at a time
  if (Activator.current) {
    Activator.current.deactivate();
  }
  Activator.current = this;

  this.active = true;
  this.dom.overlay.style.display = 'none';
  util.addClassName(this.dom.container, 'vis-active');

  this.emit('change');
  this.emit('activate');

  // ugly hack: bind ESC after emitting the events, as the Network rebinds all
  // keyboard events on a 'change' event
  this.keycharm.bind('esc', this.escListener);
};

/**
 * Deactivate the element
 * Overlay is displayed on top of the element
 */
Activator.prototype.deactivate = function () {
  this.active = false;
  this.dom.overlay.style.display = '';
  util.removeClassName(this.dom.container, 'vis-active');
  this.keycharm.unbind('esc', this.escListener);

  this.emit('change');
  this.emit('deactivate');
};

/**
 * Handle a tap event: activate the container
 * @param event
 * @private
 */
Activator.prototype._onTapOverlay = function (event) {
  // activate the container
  this.activate();
  event.stopPropagation();
};

/**
 * Test whether the element has the requested parent element somewhere in
 * its chain of parent nodes.
 * @param {HTMLElement} element
 * @param {HTMLElement} parent
 * @returns {boolean} Returns true when the parent is found somewhere in the
 *                    chain of parent nodes.
 * @private
 */
function _hasParent(element, parent) {
  while (element) {
    if (element === parent) {
      return true;
    }
    element = element.parentNode;
  }
  return false;
}

module.exports = Activator;

},{"../module/hammer":6,"../util":73,"emitter-component":74,"keycharm":76}],70:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Hammer = require('../module/hammer');
var hammerUtil = require('../hammerUtil');
var util = require('../util');

var ColorPicker = (function () {
  function ColorPicker() {
    var pixelRatio = arguments.length <= 0 || arguments[0] === undefined ? 1 : arguments[0];

    _classCallCheck(this, ColorPicker);

    this.pixelRatio = pixelRatio;
    this.generated = false;
    this.centerCoordinates = { x: 289 / 2, y: 289 / 2 };
    this.r = 289 * 0.49;
    this.color = { r: 255, g: 255, b: 255, a: 1.0 };
    this.hueCircle = undefined;
    this.initialColor = { r: 255, g: 255, b: 255, a: 1.0 };
    this.previousColor = undefined;
    this.applied = false;

    // bound by
    this.updateCallback = function () {};

    // create all DOM elements
    this._create();
  }

  /**
   * this inserts the colorPicker into a div from the DOM
   * @param container
   */

  _createClass(ColorPicker, [{
    key: 'insertTo',
    value: function insertTo(container) {
      if (this.hammer !== undefined) {
        this.hammer.destroy();
        this.hammer = undefined;
      }
      this.container = container;
      this.container.appendChild(this.frame);
      this._bindHammer();

      this._setSize();
    }

    /**
     * the callback is executed on apply and save. Bind it to the application
     * @param callback
     */
  }, {
    key: 'setCallback',
    value: function setCallback(callback) {
      if (typeof callback === 'function') {
        this.updateCallback = callback;
      } else {
        throw new Error("Function attempted to set as colorPicker callback is not a function.");
      }
    }
  }, {
    key: '_isColorString',
    value: function _isColorString(color) {
      var htmlColors = { black: '#000000', navy: '#000080', darkblue: '#00008B', mediumblue: '#0000CD', blue: '#0000FF', darkgreen: '#006400', green: '#008000', teal: '#008080', darkcyan: '#008B8B', deepskyblue: '#00BFFF', darkturquoise: '#00CED1', mediumspringgreen: '#00FA9A', lime: '#00FF00', springgreen: '#00FF7F', aqua: '#00FFFF', cyan: '#00FFFF', midnightblue: '#191970', dodgerblue: '#1E90FF', lightseagreen: '#20B2AA', forestgreen: '#228B22', seagreen: '#2E8B57', darkslategray: '#2F4F4F', limegreen: '#32CD32', mediumseagreen: '#3CB371', turquoise: '#40E0D0', royalblue: '#4169E1', steelblue: '#4682B4', darkslateblue: '#483D8B', mediumturquoise: '#48D1CC', indigo: '#4B0082', darkolivegreen: '#556B2F', cadetblue: '#5F9EA0', cornflowerblue: '#6495ED', mediumaquamarine: '#66CDAA', dimgray: '#696969', slateblue: '#6A5ACD', olivedrab: '#6B8E23', slategray: '#708090', lightslategray: '#778899', mediumslateblue: '#7B68EE', lawngreen: '#7CFC00', chartreuse: '#7FFF00', aquamarine: '#7FFFD4', maroon: '#800000', purple: '#800080', olive: '#808000', gray: '#808080', skyblue: '#87CEEB', lightskyblue: '#87CEFA', blueviolet: '#8A2BE2', darkred: '#8B0000', darkmagenta: '#8B008B', saddlebrown: '#8B4513', darkseagreen: '#8FBC8F', lightgreen: '#90EE90', mediumpurple: '#9370D8', darkviolet: '#9400D3', palegreen: '#98FB98', darkorchid: '#9932CC', yellowgreen: '#9ACD32', sienna: '#A0522D', brown: '#A52A2A', darkgray: '#A9A9A9', lightblue: '#ADD8E6', greenyellow: '#ADFF2F', paleturquoise: '#AFEEEE', lightsteelblue: '#B0C4DE', powderblue: '#B0E0E6', firebrick: '#B22222', darkgoldenrod: '#B8860B', mediumorchid: '#BA55D3', rosybrown: '#BC8F8F', darkkhaki: '#BDB76B', silver: '#C0C0C0', mediumvioletred: '#C71585', indianred: '#CD5C5C', peru: '#CD853F', chocolate: '#D2691E', tan: '#D2B48C', lightgrey: '#D3D3D3', palevioletred: '#D87093', thistle: '#D8BFD8', orchid: '#DA70D6', goldenrod: '#DAA520', crimson: '#DC143C', gainsboro: '#DCDCDC', plum: '#DDA0DD', burlywood: '#DEB887', lightcyan: '#E0FFFF', lavender: '#E6E6FA', darksalmon: '#E9967A', violet: '#EE82EE', palegoldenrod: '#EEE8AA', lightcoral: '#F08080', khaki: '#F0E68C', aliceblue: '#F0F8FF', honeydew: '#F0FFF0', azure: '#F0FFFF', sandybrown: '#F4A460', wheat: '#F5DEB3', beige: '#F5F5DC', whitesmoke: '#F5F5F5', mintcream: '#F5FFFA', ghostwhite: '#F8F8FF', salmon: '#FA8072', antiquewhite: '#FAEBD7', linen: '#FAF0E6', lightgoldenrodyellow: '#FAFAD2', oldlace: '#FDF5E6', red: '#FF0000', fuchsia: '#FF00FF', magenta: '#FF00FF', deeppink: '#FF1493', orangered: '#FF4500', tomato: '#FF6347', hotpink: '#FF69B4', coral: '#FF7F50', darkorange: '#FF8C00', lightsalmon: '#FFA07A', orange: '#FFA500', lightpink: '#FFB6C1', pink: '#FFC0CB', gold: '#FFD700', peachpuff: '#FFDAB9', navajowhite: '#FFDEAD', moccasin: '#FFE4B5', bisque: '#FFE4C4', mistyrose: '#FFE4E1', blanchedalmond: '#FFEBCD', papayawhip: '#FFEFD5', lavenderblush: '#FFF0F5', seashell: '#FFF5EE', cornsilk: '#FFF8DC', lemonchiffon: '#FFFACD', floralwhite: '#FFFAF0', snow: '#FFFAFA', yellow: '#FFFF00', lightyellow: '#FFFFE0', ivory: '#FFFFF0', white: '#FFFFFF' };
      if (typeof color === 'string') {
        return htmlColors[color];
      }
    }

    /**
     * Set the color of the colorPicker
     * Supported formats:
     * 'red'                   --> HTML color string
     * '#ffffff'               --> hex string
     * 'rbg(255,255,255)'      --> rgb string
     * 'rgba(255,255,255,1.0)' --> rgba string
     * {r:255,g:255,b:255}     --> rgb object
     * {r:255,g:255,b:255,a:1.0} --> rgba object
     * @param color
     * @param setInitial
     */
  }, {
    key: 'setColor',
    value: function setColor(color) {
      var setInitial = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      if (color === 'none') {
        return;
      }

      var rgba = undefined;

      // if a html color shorthand is used, convert to hex
      var htmlColor = this._isColorString(color);
      if (htmlColor !== undefined) {
        color = htmlColor;
      }

      // check format
      if (util.isString(color) === true) {
        if (util.isValidRGB(color) === true) {
          var rgbaArray = color.substr(4).substr(0, color.length - 5).split(',');
          rgba = { r: rgbaArray[0], g: rgbaArray[1], b: rgbaArray[2], a: 1.0 };
        } else if (util.isValidRGBA(color) === true) {
          var rgbaArray = color.substr(5).substr(0, color.length - 6).split(',');
          rgba = { r: rgbaArray[0], g: rgbaArray[1], b: rgbaArray[2], a: rgbaArray[3] };
        } else if (util.isValidHex(color) === true) {
          var rgbObj = util.hexToRGB(color);
          rgba = { r: rgbObj.r, g: rgbObj.g, b: rgbObj.b, a: 1.0 };
        }
      } else {
        if (color instanceof Object) {
          if (color.r !== undefined && color.g !== undefined && color.b !== undefined) {
            var alpha = color.a !== undefined ? color.a : '1.0';
            rgba = { r: color.r, g: color.g, b: color.b, a: alpha };
          }
        }
      }

      // set color
      if (rgba === undefined) {
        throw new Error("Unknown color passed to the colorPicker. Supported are strings: rgb, hex, rgba. Object: rgb ({r:r,g:g,b:b,[a:a]}). Supplied: " + JSON.stringify(color));
      } else {
        this._setColor(rgba, setInitial);
      }
    }

    /**
     * this shows the color picker at a location. The hue circle is constructed once and stored.
     * @param x
     * @param y
     */
  }, {
    key: 'show',
    value: function show(x, y) {
      this.applied = false;
      this.frame.style.display = 'block';
      this.frame.style.top = y + 'px';
      this.frame.style.left = x + 'px';
      this._generateHueCircle();
    }

    // ------------------------------------------ PRIVATE ----------------------------- //

    /**
     * Hide the picker. Is called by the cancel button.
     * Optional boolean to store the previous color for easy access later on.
     * @param storePrevious
     * @private
     */
  }, {
    key: '_hide',
    value: function _hide() {
      var storePrevious = arguments.length <= 0 || arguments[0] === undefined ? true : arguments[0];

      // store the previous color for next time;
      if (storePrevious === true) {
        this.previousColor = util.extend({}, this.color);
      }

      if (this.applied === true) {
        this.updateCallback(this.initialColor);
      }

      this.frame.style.display = 'none';
    }

    /**
     * bound to the save button. Saves and hides.
     * @private
     */
  }, {
    key: '_save',
    value: function _save() {
      this.updateCallback(this.color);
      this.applied = false;
      this._hide();
    }

    /**
     * Bound to apply button. Saves but does not close. Is undone by the cancel button.
     * @private
     */
  }, {
    key: '_apply',
    value: function _apply() {
      this.applied = true;
      this.updateCallback(this.color);
      this._updatePicker(this.color);
    }

    /**
     * load the color from the previous session.
     * @private
     */
  }, {
    key: '_loadLast',
    value: function _loadLast() {
      if (this.previousColor !== undefined) {
        this.setColor(this.previousColor, false);
      } else {
        alert("There is no last color to load...");
      }
    }

    /**
     * set the color, place the picker
     * @param rgba
     * @param setInitial
     * @private
     */
  }, {
    key: '_setColor',
    value: function _setColor(rgba) {
      var setInitial = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

      // store the initial color
      if (setInitial === true) {
        this.initialColor = util.extend({}, rgba);
      }

      this.color = rgba;
      var hsv = util.RGBToHSV(rgba.r, rgba.g, rgba.b);

      var angleConvert = 2 * Math.PI;
      var radius = this.r * hsv.s;
      var x = this.centerCoordinates.x + radius * Math.sin(angleConvert * hsv.h);
      var y = this.centerCoordinates.y + radius * Math.cos(angleConvert * hsv.h);

      this.colorPickerSelector.style.left = x - 0.5 * this.colorPickerSelector.clientWidth + 'px';
      this.colorPickerSelector.style.top = y - 0.5 * this.colorPickerSelector.clientHeight + 'px';

      this._updatePicker(rgba);
    }

    /**
     * bound to opacity control
     * @param value
     * @private
     */
  }, {
    key: '_setOpacity',
    value: function _setOpacity(value) {
      this.color.a = value / 100;
      this._updatePicker(this.color);
    }

    /**
     * bound to brightness control
     * @param value
     * @private
     */
  }, {
    key: '_setBrightness',
    value: function _setBrightness(value) {
      var hsv = util.RGBToHSV(this.color.r, this.color.g, this.color.b);
      hsv.v = value / 100;
      var rgba = util.HSVToRGB(hsv.h, hsv.s, hsv.v);
      rgba['a'] = this.color.a;
      this.color = rgba;
      this._updatePicker();
    }

    /**
     * update the colorpicker. A black circle overlays the hue circle to mimic the brightness decreasing.
     * @param rgba
     * @private
     */
  }, {
    key: '_updatePicker',
    value: function _updatePicker() {
      var rgba = arguments.length <= 0 || arguments[0] === undefined ? this.color : arguments[0];

      var hsv = util.RGBToHSV(rgba.r, rgba.g, rgba.b);
      var ctx = this.colorPickerCanvas.getContext('2d');
      if (this.pixelRation === undefined) {
        this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);
      }
      ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

      // clear the canvas
      var w = this.colorPickerCanvas.clientWidth;
      var h = this.colorPickerCanvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      ctx.putImageData(this.hueCircle, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - hsv.v) + ')';
      ctx.circle(this.centerCoordinates.x, this.centerCoordinates.y, this.r);
      ctx.fill();

      this.brightnessRange.value = 100 * hsv.v;
      this.opacityRange.value = 100 * rgba.a;

      this.initialColorDiv.style.backgroundColor = 'rgba(' + this.initialColor.r + ',' + this.initialColor.g + ',' + this.initialColor.b + ',' + this.initialColor.a + ')';
      this.newColorDiv.style.backgroundColor = 'rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',' + this.color.a + ')';
    }

    /**
     * used by create to set the size of the canvas.
     * @private
     */
  }, {
    key: '_setSize',
    value: function _setSize() {
      this.colorPickerCanvas.style.width = '100%';
      this.colorPickerCanvas.style.height = '100%';

      this.colorPickerCanvas.width = 289 * this.pixelRatio;
      this.colorPickerCanvas.height = 289 * this.pixelRatio;
    }

    /**
     * create all dom elements
     * TODO: cleanup, lots of similar dom elements
     * @private
     */
  }, {
    key: '_create',
    value: function _create() {
      this.frame = document.createElement('div');
      this.frame.className = 'vis-color-picker';

      this.colorPickerDiv = document.createElement('div');
      this.colorPickerSelector = document.createElement('div');
      this.colorPickerSelector.className = 'vis-selector';
      this.colorPickerDiv.appendChild(this.colorPickerSelector);

      this.colorPickerCanvas = document.createElement('canvas');
      this.colorPickerDiv.appendChild(this.colorPickerCanvas);

      if (!this.colorPickerCanvas.getContext) {
        var noCanvas = document.createElement('DIV');
        noCanvas.style.color = 'red';
        noCanvas.style.fontWeight = 'bold';
        noCanvas.style.padding = '10px';
        noCanvas.innerHTML = 'Error: your browser does not support HTML canvas';
        this.colorPickerCanvas.appendChild(noCanvas);
      } else {
        var ctx = this.colorPickerCanvas.getContext("2d");
        this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);

        this.colorPickerCanvas.getContext("2d").setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      }

      this.colorPickerDiv.className = 'vis-color';

      this.opacityDiv = document.createElement('div');
      this.opacityDiv.className = 'vis-opacity';

      this.brightnessDiv = document.createElement('div');
      this.brightnessDiv.className = 'vis-brightness';

      this.arrowDiv = document.createElement('div');
      this.arrowDiv.className = 'vis-arrow';

      this.opacityRange = document.createElement('input');
      try {
        this.opacityRange.type = 'range'; // Not supported on IE9
        this.opacityRange.min = '0';
        this.opacityRange.max = '100';
      } catch (err) {}
      this.opacityRange.value = '100';
      this.opacityRange.className = 'vis-range';

      this.brightnessRange = document.createElement('input');
      try {
        this.brightnessRange.type = 'range'; // Not supported on IE9
        this.brightnessRange.min = '0';
        this.brightnessRange.max = '100';
      } catch (err) {}
      this.brightnessRange.value = '100';
      this.brightnessRange.className = 'vis-range';

      this.opacityDiv.appendChild(this.opacityRange);
      this.brightnessDiv.appendChild(this.brightnessRange);

      var me = this;
      this.opacityRange.onchange = function () {
        me._setOpacity(this.value);
      };
      this.opacityRange.oninput = function () {
        me._setOpacity(this.value);
      };
      this.brightnessRange.onchange = function () {
        me._setBrightness(this.value);
      };
      this.brightnessRange.oninput = function () {
        me._setBrightness(this.value);
      };

      this.brightnessLabel = document.createElement("div");
      this.brightnessLabel.className = "vis-label vis-brightness";
      this.brightnessLabel.innerHTML = 'brightness:';

      this.opacityLabel = document.createElement("div");
      this.opacityLabel.className = "vis-label vis-opacity";
      this.opacityLabel.innerHTML = 'opacity:';

      this.newColorDiv = document.createElement("div");
      this.newColorDiv.className = "vis-new-color";
      this.newColorDiv.innerHTML = 'new';

      this.initialColorDiv = document.createElement("div");
      this.initialColorDiv.className = "vis-initial-color";
      this.initialColorDiv.innerHTML = 'initial';

      this.cancelButton = document.createElement("div");
      this.cancelButton.className = "vis-button vis-cancel";
      this.cancelButton.innerHTML = 'cancel';
      this.cancelButton.onclick = this._hide.bind(this, false);

      this.applyButton = document.createElement("div");
      this.applyButton.className = "vis-button vis-apply";
      this.applyButton.innerHTML = 'apply';
      this.applyButton.onclick = this._apply.bind(this);

      this.saveButton = document.createElement("div");
      this.saveButton.className = "vis-button vis-save";
      this.saveButton.innerHTML = 'save';
      this.saveButton.onclick = this._save.bind(this);

      this.loadButton = document.createElement("div");
      this.loadButton.className = "vis-button vis-load";
      this.loadButton.innerHTML = 'load last';
      this.loadButton.onclick = this._loadLast.bind(this);

      this.frame.appendChild(this.colorPickerDiv);
      this.frame.appendChild(this.arrowDiv);
      this.frame.appendChild(this.brightnessLabel);
      this.frame.appendChild(this.brightnessDiv);
      this.frame.appendChild(this.opacityLabel);
      this.frame.appendChild(this.opacityDiv);
      this.frame.appendChild(this.newColorDiv);
      this.frame.appendChild(this.initialColorDiv);

      this.frame.appendChild(this.cancelButton);
      this.frame.appendChild(this.applyButton);
      this.frame.appendChild(this.saveButton);
      this.frame.appendChild(this.loadButton);
    }

    /**
     * bind hammer to the color picker
     * @private
     */
  }, {
    key: '_bindHammer',
    value: function _bindHammer() {
      var _this = this;

      this.drag = {};
      this.pinch = {};
      this.hammer = new Hammer(this.colorPickerCanvas);
      this.hammer.get('pinch').set({ enable: true });

      hammerUtil.onTouch(this.hammer, function (event) {
        _this._moveSelector(event);
      });
      this.hammer.on('tap', function (event) {
        _this._moveSelector(event);
      });
      this.hammer.on('panstart', function (event) {
        _this._moveSelector(event);
      });
      this.hammer.on('panmove', function (event) {
        _this._moveSelector(event);
      });
      this.hammer.on('panend', function (event) {
        _this._moveSelector(event);
      });
    }

    /**
     * generate the hue circle. This is relatively heavy (200ms) and is done only once on the first time it is shown.
     * @private
     */
  }, {
    key: '_generateHueCircle',
    value: function _generateHueCircle() {
      if (this.generated === false) {
        var ctx = this.colorPickerCanvas.getContext('2d');
        if (this.pixelRation === undefined) {
          this.pixelRatio = (window.devicePixelRatio || 1) / (ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1);
        }
        ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

        // clear the canvas
        var w = this.colorPickerCanvas.clientWidth;
        var h = this.colorPickerCanvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        // draw hue circle
        var x = undefined,
            y = undefined,
            hue = undefined,
            sat = undefined;
        this.centerCoordinates = { x: w * 0.5, y: h * 0.5 };
        this.r = 0.49 * w;
        var angleConvert = 2 * Math.PI / 360;
        var hfac = 1 / 360;
        var sfac = 1 / this.r;
        var rgb = undefined;
        for (hue = 0; hue < 360; hue++) {
          for (sat = 0; sat < this.r; sat++) {
            x = this.centerCoordinates.x + sat * Math.sin(angleConvert * hue);
            y = this.centerCoordinates.y + sat * Math.cos(angleConvert * hue);
            rgb = util.HSVToRGB(hue * hfac, sat * sfac, 1);
            ctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
            ctx.fillRect(x - 0.5, y - 0.5, 2, 2);
          }
        }
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.circle(this.centerCoordinates.x, this.centerCoordinates.y, this.r);
        ctx.stroke();

        this.hueCircle = ctx.getImageData(0, 0, w, h);
      }
      this.generated = true;
    }

    /**
     * move the selector. This is called by hammer functions.
     *
     * @param event
     * @private
     */
  }, {
    key: '_moveSelector',
    value: function _moveSelector(event) {
      var rect = this.colorPickerDiv.getBoundingClientRect();
      var left = event.center.x - rect.left;
      var top = event.center.y - rect.top;

      var centerY = 0.5 * this.colorPickerDiv.clientHeight;
      var centerX = 0.5 * this.colorPickerDiv.clientWidth;

      var x = left - centerX;
      var y = top - centerY;

      var angle = Math.atan2(x, y);
      var radius = 0.98 * Math.min(Math.sqrt(x * x + y * y), centerX);

      var newTop = Math.cos(angle) * radius + centerY;
      var newLeft = Math.sin(angle) * radius + centerX;

      this.colorPickerSelector.style.top = newTop - 0.5 * this.colorPickerSelector.clientHeight + 'px';
      this.colorPickerSelector.style.left = newLeft - 0.5 * this.colorPickerSelector.clientWidth + 'px';

      // set color
      var h = angle / (2 * Math.PI);
      h = h < 0 ? h + 1 : h;
      var s = radius / this.r;
      var hsv = util.RGBToHSV(this.color.r, this.color.g, this.color.b);
      hsv.h = h;
      hsv.s = s;
      var rgba = util.HSVToRGB(hsv.h, hsv.s, hsv.v);
      rgba['a'] = this.color.a;
      this.color = rgba;

      // update previews
      this.initialColorDiv.style.backgroundColor = 'rgba(' + this.initialColor.r + ',' + this.initialColor.g + ',' + this.initialColor.b + ',' + this.initialColor.a + ')';
      this.newColorDiv.style.backgroundColor = 'rgba(' + this.color.r + ',' + this.color.g + ',' + this.color.b + ',' + this.color.a + ')';
    }
  }]);

  return ColorPicker;
})();

exports['default'] = ColorPicker;
module.exports = exports['default'];

},{"../hammerUtil":5,"../module/hammer":6,"../util":73}],71:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _ColorPicker = require('./ColorPicker');

var _ColorPicker2 = _interopRequireDefault(_ColorPicker);

/**
 * The way this works is for all properties of this.possible options, you can supply the property name in any form to list the options.
 * Boolean options are recognised as Boolean
 * Number options should be written as array: [default value, min value, max value, stepsize]
 * Colors should be written as array: ['color', '#ffffff']
 * Strings with should be written as array: [option1, option2, option3, ..]
 *
 * The options are matched with their counterparts in each of the modules and the values used in the configuration are
 *
 * @param parentModule        | the location where parentModule.setOptions() can be called
 * @param defaultContainer    | the default container of the module
 * @param configureOptions    | the fully configured and predefined options set found in allOptions.js
 * @param pixelRatio          | canvas pixel ratio
 */
var util = require('../util');

var Configurator = (function () {
  function Configurator(parentModule, defaultContainer, configureOptions) {
    var pixelRatio = arguments.length <= 3 || arguments[3] === undefined ? 1 : arguments[3];

    _classCallCheck(this, Configurator);

    this.parent = parentModule;
    this.changedOptions = [];
    this.container = defaultContainer;
    this.allowCreation = false;

    this.options = {};
    this.initialized = false;
    this.popupCounter = 0;
    this.defaultOptions = {
      enabled: false,
      filter: true,
      container: undefined,
      showButton: true
    };
    util.extend(this.options, this.defaultOptions);

    this.configureOptions = configureOptions;
    this.moduleOptions = {};
    this.domElements = [];
    this.popupDiv = {};
    this.popupLimit = 5;
    this.popupHistory = {};
    this.colorPicker = new _ColorPicker2['default'](pixelRatio);
    this.wrapper = undefined;
  }

  /**
   * refresh all options.
   * Because all modules parse their options by themselves, we just use their options. We copy them here.
   *
   * @param options
   */

  _createClass(Configurator, [{
    key: 'setOptions',
    value: function setOptions(options) {
      if (options !== undefined) {
        // reset the popup history because the indices may have been changed.
        this.popupHistory = {};
        this._removePopup();

        var enabled = true;
        if (typeof options === 'string') {
          this.options.filter = options;
        } else if (options instanceof Array) {
          this.options.filter = options.join();
        } else if (typeof options === 'object') {
          if (options.container !== undefined) {
            this.options.container = options.container;
          }
          if (options.filter !== undefined) {
            this.options.filter = options.filter;
          }
          if (options.showButton !== undefined) {
            this.options.showButton = options.showButton;
          }
          if (options.enabled !== undefined) {
            enabled = options.enabled;
          }
        } else if (typeof options === 'boolean') {
          this.options.filter = true;
          enabled = options;
        } else if (typeof options === 'function') {
          this.options.filter = options;
          enabled = true;
        }
        if (this.options.filter === false) {
          enabled = false;
        }

        this.options.enabled = enabled;
      }
      this._clean();
    }
  }, {
    key: 'setModuleOptions',
    value: function setModuleOptions(moduleOptions) {
      this.moduleOptions = moduleOptions;
      if (this.options.enabled === true) {
        this._clean();
        if (this.options.container !== undefined) {
          this.container = this.options.container;
        }
        this._create();
      }
    }

    /**
     * Create all DOM elements
     * @private
     */
  }, {
    key: '_create',
    value: function _create() {
      var _this = this;

      this._clean();
      this.changedOptions = [];

      var filter = this.options.filter;
      var counter = 0;
      var show = false;
      for (var option in this.configureOptions) {
        if (this.configureOptions.hasOwnProperty(option)) {
          this.allowCreation = false;
          show = false;
          if (typeof filter === 'function') {
            show = filter(option, []);
            show = show || this._handleObject(this.configureOptions[option], [option], true);
          } else if (filter === true || filter.indexOf(option) !== -1) {
            show = true;
          }

          if (show !== false) {
            this.allowCreation = true;

            // linebreak between categories
            if (counter > 0) {
              this._makeItem([]);
            }
            // a header for the category
            this._makeHeader(option);

            // get the suboptions
            this._handleObject(this.configureOptions[option], [option]);
          }
          counter++;
        }
      }

      if (this.options.showButton === true) {
        (function () {
          var generateButton = document.createElement('div');
          generateButton.className = 'vis-configuration vis-config-button';
          generateButton.innerHTML = 'generate options';
          generateButton.onclick = function () {
            _this._printOptions();
          };
          generateButton.onmouseover = function () {
            generateButton.className = 'vis-configuration vis-config-button hover';
          };
          generateButton.onmouseout = function () {
            generateButton.className = 'vis-configuration vis-config-button';
          };

          _this.optionsContainer = document.createElement('div');
          _this.optionsContainer.className = 'vis-configuration vis-config-option-container';

          _this.domElements.push(_this.optionsContainer);
          _this.domElements.push(generateButton);
        })();
      }

      this._push();
      this.colorPicker.insertTo(this.container);
    }

    /**
     * draw all DOM elements on the screen
     * @private
     */
  }, {
    key: '_push',
    value: function _push() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'vis-configuration-wrapper';
      this.container.appendChild(this.wrapper);
      for (var i = 0; i < this.domElements.length; i++) {
        this.wrapper.appendChild(this.domElements[i]);
      }

      this._showPopupIfNeeded();
    }

    /**
     * delete all DOM elements
     * @private
     */
  }, {
    key: '_clean',
    value: function _clean() {
      for (var i = 0; i < this.domElements.length; i++) {
        this.wrapper.removeChild(this.domElements[i]);
      }

      if (this.wrapper !== undefined) {
        this.container.removeChild(this.wrapper);
        this.wrapper = undefined;
      }
      this.domElements = [];

      this._removePopup();
    }

    /**
     * get the value from the actualOptions if it exists
     * @param {array} path    | where to look for the actual option
     * @returns {*}
     * @private
     */
  }, {
    key: '_getValue',
    value: function _getValue(path) {
      var base = this.moduleOptions;
      for (var i = 0; i < path.length; i++) {
        if (base[path[i]] !== undefined) {
          base = base[path[i]];
        } else {
          base = undefined;
          break;
        }
      }
      return base;
    }

    /**
     * all option elements are wrapped in an item
     * @param path
     * @param domElements
     * @private
     */
  }, {
    key: '_makeItem',
    value: function _makeItem(path) {
      var _arguments = arguments,
          _this2 = this;

      if (this.allowCreation === true) {
        var _len, domElements, _key;

        var _ret2 = (function () {
          var item = document.createElement('div');
          item.className = 'vis-configuration vis-config-item vis-config-s' + path.length;

          for (_len = _arguments.length, domElements = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            domElements[_key - 1] = _arguments[_key];
          }

          domElements.forEach(function (element) {
            item.appendChild(element);
          });
          _this2.domElements.push(item);
          return {
            v: _this2.domElements.length
          };
        })();

        if (typeof _ret2 === 'object') return _ret2.v;
      }
      return 0;
    }

    /**
     * header for major subjects
     * @param name
     * @private
     */
  }, {
    key: '_makeHeader',
    value: function _makeHeader(name) {
      var div = document.createElement('div');
      div.className = 'vis-configuration vis-config-header';
      div.innerHTML = name;
      this._makeItem([], div);
    }

    /**
     * make a label, if it is an object label, it gets different styling.
     * @param name
     * @param path
     * @param objectLabel
     * @returns {HTMLElement}
     * @private
     */
  }, {
    key: '_makeLabel',
    value: function _makeLabel(name, path) {
      var objectLabel = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

      var div = document.createElement('div');
      div.className = 'vis-configuration vis-config-label vis-config-s' + path.length;
      if (objectLabel === true) {
        div.innerHTML = '<i><b>' + name + ':</b></i>';
      } else {
        div.innerHTML = name + ':';
      }
      return div;
    }

    /**
     * make a dropdown list for multiple possible string optoins
     * @param arr
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_makeDropdown',
    value: function _makeDropdown(arr, value, path) {
      var select = document.createElement('select');
      select.className = 'vis-configuration vis-config-select';
      var selectedValue = 0;
      if (value !== undefined) {
        if (arr.indexOf(value) !== -1) {
          selectedValue = arr.indexOf(value);
        }
      }

      for (var i = 0; i < arr.length; i++) {
        var option = document.createElement('option');
        option.value = arr[i];
        if (i === selectedValue) {
          option.selected = 'selected';
        }
        option.innerHTML = arr[i];
        select.appendChild(option);
      }

      var me = this;
      select.onchange = function () {
        me._update(this.value, path);
      };

      var label = this._makeLabel(path[path.length - 1], path);
      this._makeItem(path, label, select);
    }

    /**
     * make a range object for numeric options
     * @param arr
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_makeRange',
    value: function _makeRange(arr, value, path) {
      var defaultValue = arr[0];
      var min = arr[1];
      var max = arr[2];
      var step = arr[3];
      var range = document.createElement('input');
      range.className = 'vis-configuration vis-config-range';
      try {
        range.type = 'range'; // not supported on IE9
        range.min = min;
        range.max = max;
      } catch (err) {}
      range.step = step;

      // set up the popup settings in case they are needed.
      var popupString = '';
      var popupValue = 0;

      if (value !== undefined) {
        var factor = 1.20;
        if (value < 0 && value * factor < min) {
          range.min = Math.ceil(value * factor);
          popupValue = range.min;
          popupString = 'range increased';
        } else if (value / factor < min) {
          range.min = Math.ceil(value / factor);
          popupValue = range.min;
          popupString = 'range increased';
        }
        if (value * factor > max && max !== 1) {
          range.max = Math.ceil(value * factor);
          popupValue = range.max;
          popupString = 'range increased';
        }
        range.value = value;
      } else {
        range.value = defaultValue;
      }

      var input = document.createElement('input');
      input.className = 'vis-configuration vis-config-rangeinput';
      input.value = range.value;

      var me = this;
      range.onchange = function () {
        input.value = this.value;me._update(Number(this.value), path);
      };
      range.oninput = function () {
        input.value = this.value;
      };

      var label = this._makeLabel(path[path.length - 1], path);
      var itemIndex = this._makeItem(path, label, range, input);

      // if a popup is needed AND it has not been shown for this value, show it.
      if (popupString !== '' && this.popupHistory[itemIndex] !== popupValue) {
        this.popupHistory[itemIndex] = popupValue;
        this._setupPopup(popupString, itemIndex);
      }
    }

    /**
     * prepare the popup
     * @param string
     * @param index
     * @private
     */
  }, {
    key: '_setupPopup',
    value: function _setupPopup(string, index) {
      var _this3 = this;

      if (this.initialized === true && this.allowCreation === true && this.popupCounter < this.popupLimit) {
        var div = document.createElement("div");
        div.id = "vis-configuration-popup";
        div.className = "vis-configuration-popup";
        div.innerHTML = string;
        div.onclick = function () {
          _this3._removePopup();
        };
        this.popupCounter += 1;
        this.popupDiv = { html: div, index: index };
      }
    }

    /**
     * remove the popup from the dom
     * @private
     */
  }, {
    key: '_removePopup',
    value: function _removePopup() {
      if (this.popupDiv.html !== undefined) {
        this.popupDiv.html.parentNode.removeChild(this.popupDiv.html);
        clearTimeout(this.popupDiv.hideTimeout);
        clearTimeout(this.popupDiv.deleteTimeout);
        this.popupDiv = {};
      }
    }

    /**
     * Show the popup if it is needed.
     * @private
     */
  }, {
    key: '_showPopupIfNeeded',
    value: function _showPopupIfNeeded() {
      var _this4 = this;

      if (this.popupDiv.html !== undefined) {
        var correspondingElement = this.domElements[this.popupDiv.index];
        var rect = correspondingElement.getBoundingClientRect();
        this.popupDiv.html.style.left = rect.left + "px";
        this.popupDiv.html.style.top = rect.top - 30 + "px"; // 30 is the height;
        document.body.appendChild(this.popupDiv.html);
        this.popupDiv.hideTimeout = setTimeout(function () {
          _this4.popupDiv.html.style.opacity = 0;
        }, 1500);
        this.popupDiv.deleteTimeout = setTimeout(function () {
          _this4._removePopup();
        }, 1800);
      }
    }

    /**
     * make a checkbox for boolean options.
     * @param defaultValue
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_makeCheckbox',
    value: function _makeCheckbox(defaultValue, value, path) {
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'vis-configuration vis-config-checkbox';
      checkbox.checked = defaultValue;
      if (value !== undefined) {
        checkbox.checked = value;
        if (value !== defaultValue) {
          if (typeof defaultValue === 'object') {
            if (value !== defaultValue.enabled) {
              this.changedOptions.push({ path: path, value: value });
            }
          } else {
            this.changedOptions.push({ path: path, value: value });
          }
        }
      }

      var me = this;
      checkbox.onchange = function () {
        me._update(this.checked, path);
      };

      var label = this._makeLabel(path[path.length - 1], path);
      this._makeItem(path, label, checkbox);
    }

    /**
     * make a text input field for string options.
     * @param defaultValue
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_makeTextInput',
    value: function _makeTextInput(defaultValue, value, path) {
      var checkbox = document.createElement('input');
      checkbox.type = 'text';
      checkbox.className = 'vis-configuration vis-config-text';
      checkbox.value = value;
      if (value !== defaultValue) {
        this.changedOptions.push({ path: path, value: value });
      }

      var me = this;
      checkbox.onchange = function () {
        me._update(this.value, path);
      };

      var label = this._makeLabel(path[path.length - 1], path);
      this._makeItem(path, label, checkbox);
    }

    /**
     * make a color field with a color picker for color fields
     * @param arr
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_makeColorField',
    value: function _makeColorField(arr, value, path) {
      var _this5 = this;

      var defaultColor = arr[1];
      var div = document.createElement('div');
      value = value === undefined ? defaultColor : value;

      if (value !== 'none') {
        div.className = 'vis-configuration vis-config-colorBlock';
        div.style.backgroundColor = value;
      } else {
        div.className = 'vis-configuration vis-config-colorBlock none';
      }

      value = value === undefined ? defaultColor : value;
      div.onclick = function () {
        _this5._showColorPicker(value, div, path);
      };

      var label = this._makeLabel(path[path.length - 1], path);
      this._makeItem(path, label, div);
    }

    /**
     * used by the color buttons to call the color picker.
     * @param event
     * @param value
     * @param div
     * @param path
     * @private
     */
  }, {
    key: '_showColorPicker',
    value: function _showColorPicker(value, div, path) {
      var _this6 = this;

      var rect = div.getBoundingClientRect();
      var bodyRect = document.body.getBoundingClientRect();
      var pickerX = rect.left + rect.width + 5;
      var pickerY = rect.top - bodyRect.top + rect.height + 2;
      this.colorPicker.show(pickerX, pickerY);
      this.colorPicker.setColor(value);
      this.colorPicker.setCallback(function (color) {
        var colorString = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + color.a + ')';
        div.style.backgroundColor = colorString;
        _this6._update(colorString, path);
      });
    }

    /**
     * parse an object and draw the correct items
     * @param obj
     * @param path
     * @private
     */
  }, {
    key: '_handleObject',
    value: function _handleObject(obj) {
      var path = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];
      var checkOnly = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

      var show = false;
      var filter = this.options.filter;
      var visibleInSet = false;
      for (var subObj in obj) {
        if (obj.hasOwnProperty(subObj)) {
          show = true;
          var item = obj[subObj];
          var newPath = util.copyAndExtendArray(path, subObj);
          if (typeof filter === 'function') {
            show = filter(subObj, path);

            // if needed we must go deeper into the object.
            if (show === false) {
              if (!(item instanceof Array) && typeof item !== 'string' && typeof item !== 'boolean' && item instanceof Object) {
                this.allowCreation = false;
                show = this._handleObject(item, newPath, true);
                this.allowCreation = checkOnly === false;
              }
            }
          }

          if (show !== false) {
            visibleInSet = true;
            var value = this._getValue(newPath);

            if (item instanceof Array) {
              this._handleArray(item, value, newPath);
            } else if (typeof item === 'string') {
              this._makeTextInput(item, value, newPath);
            } else if (typeof item === 'boolean') {
              this._makeCheckbox(item, value, newPath);
            } else if (item instanceof Object) {
              // collapse the physics options that are not enabled
              var draw = true;
              if (path.indexOf('physics') !== -1) {
                if (this.moduleOptions.physics.solver !== subObj) {
                  draw = false;
                }
              }

              if (draw === true) {
                // initially collapse options with an disabled enabled option.
                if (item.enabled !== undefined) {
                  var enabledPath = util.copyAndExtendArray(newPath, 'enabled');
                  var enabledValue = this._getValue(enabledPath);
                  if (enabledValue === true) {
                    var label = this._makeLabel(subObj, newPath, true);
                    this._makeItem(newPath, label);
                    visibleInSet = this._handleObject(item, newPath) || visibleInSet;
                  } else {
                    this._makeCheckbox(item, enabledValue, newPath);
                  }
                } else {
                  var label = this._makeLabel(subObj, newPath, true);
                  this._makeItem(newPath, label);
                  visibleInSet = this._handleObject(item, newPath) || visibleInSet;
                }
              }
            } else {
              console.error('dont know how to handle', item, subObj, newPath);
            }
          }
        }
      }
      return visibleInSet;
    }

    /**
     * handle the array type of option
     * @param optionName
     * @param arr
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_handleArray',
    value: function _handleArray(arr, value, path) {
      if (typeof arr[0] === 'string' && arr[0] === 'color') {
        this._makeColorField(arr, value, path);
        if (arr[1] !== value) {
          this.changedOptions.push({ path: path, value: value });
        }
      } else if (typeof arr[0] === 'string') {
        this._makeDropdown(arr, value, path);
        if (arr[0] !== value) {
          this.changedOptions.push({ path: path, value: value });
        }
      } else if (typeof arr[0] === 'number') {
        this._makeRange(arr, value, path);
        if (arr[0] !== value) {
          this.changedOptions.push({ path: path, value: Number(value) });
        }
      }
    }

    /**
     * called to update the network with the new settings.
     * @param value
     * @param path
     * @private
     */
  }, {
    key: '_update',
    value: function _update(value, path) {
      var options = this._constructOptions(value, path);

      if (this.parent.body && this.parent.body.emitter && this.parent.body.emitter.emit) {
        this.parent.body.emitter.emit("configChange", options);
      }
      this.initialized = true;
      this.parent.setOptions(options);
    }
  }, {
    key: '_constructOptions',
    value: function _constructOptions(value, path) {
      var optionsObj = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var pointer = optionsObj;

      // when dropdown boxes can be string or boolean, we typecast it into correct types
      value = value === 'true' ? true : value;
      value = value === 'false' ? false : value;

      for (var i = 0; i < path.length; i++) {
        if (path[i] !== 'global') {
          if (pointer[path[i]] === undefined) {
            pointer[path[i]] = {};
          }
          if (i !== path.length - 1) {
            pointer = pointer[path[i]];
          } else {
            pointer[path[i]] = value;
          }
        }
      }
      return optionsObj;
    }
  }, {
    key: '_printOptions',
    value: function _printOptions() {
      var options = this.getOptions();
      this.optionsContainer.innerHTML = '<pre>var options = ' + JSON.stringify(options, null, 2) + '</pre>';
    }
  }, {
    key: 'getOptions',
    value: function getOptions() {
      var options = {};
      for (var i = 0; i < this.changedOptions.length; i++) {
        this._constructOptions(this.changedOptions[i].value, this.changedOptions[i].path, options);
      }
      return options;
    }
  }]);

  return Configurator;
})();

exports['default'] = Configurator;
module.exports = exports['default'];

},{"../util":73,"./ColorPicker":70}],72:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var util = require('../util');

var errorFound = false;
var allOptions = undefined;
var printStyle = 'background: #FFeeee; color: #dd0000';
/**
 *  Used to validate options.
 */

var Validator = (function () {
  function Validator() {
    _classCallCheck(this, Validator);
  }

  /**
   * Main function to be called
   * @param options
   * @param subObject
   * @returns {boolean}
   */

  _createClass(Validator, null, [{
    key: 'validate',
    value: function validate(options, referenceOptions, subObject) {
      errorFound = false;
      allOptions = referenceOptions;
      var usedOptions = referenceOptions;
      if (subObject !== undefined) {
        usedOptions = referenceOptions[subObject];
      }
      Validator.parse(options, usedOptions, []);
      return errorFound;
    }

    /**
     * Will traverse an object recursively and check every value
     * @param options
     * @param referenceOptions
     * @param path
     */
  }, {
    key: 'parse',
    value: function parse(options, referenceOptions, path) {
      for (var option in options) {
        if (options.hasOwnProperty(option)) {
          Validator.check(option, options, referenceOptions, path);
        }
      }
    }

    /**
     * Check every value. If the value is an object, call the parse function on that object.
     * @param option
     * @param options
     * @param referenceOptions
     * @param path
     */
  }, {
    key: 'check',
    value: function check(option, options, referenceOptions, path) {
      if (referenceOptions[option] === undefined && referenceOptions.__any__ === undefined) {
        Validator.getSuggestion(option, referenceOptions, path);
      } else if (referenceOptions[option] === undefined && referenceOptions.__any__ !== undefined) {
        // __any__ is a wildcard. Any value is accepted and will be further analysed by reference.
        if (Validator.getType(options[option]) === 'object' && referenceOptions['__any__'].__type__ !== undefined) {
          // if the any subgroup is not a predefined object int he configurator we do not look deeper into the object.
          Validator.checkFields(option, options, referenceOptions, '__any__', referenceOptions['__any__'].__type__, path);
        } else {
          Validator.checkFields(option, options, referenceOptions, '__any__', referenceOptions['__any__'], path);
        }
      } else {
        // Since all options in the reference are objects, we can check whether they are supposed to be object to look for the __type__ field.
        if (referenceOptions[option].__type__ !== undefined) {
          // if this should be an object, we check if the correct type has been supplied to account for shorthand options.
          Validator.checkFields(option, options, referenceOptions, option, referenceOptions[option].__type__, path);
        } else {
          Validator.checkFields(option, options, referenceOptions, option, referenceOptions[option], path);
        }
      }
    }

    /**
     *
     * @param {String}  option     | the option property
     * @param {Object}  options    | The supplied options object
     * @param {Object}  referenceOptions    | The reference options containing all options and their allowed formats
     * @param {String}  referenceOption     | Usually this is the same as option, except when handling an __any__ tag.
     * @param {String}  refOptionType       | This is the type object from the reference options
     * @param {Array}   path      | where in the object is the option
     */
  }, {
    key: 'checkFields',
    value: function checkFields(option, options, referenceOptions, referenceOption, refOptionObj, path) {
      var optionType = Validator.getType(options[option]);
      var refOptionType = refOptionObj[optionType];
      if (refOptionType !== undefined) {
        // if the type is correct, we check if it is supposed to be one of a few select values
        if (Validator.getType(refOptionType) === 'array') {
          if (refOptionType.indexOf(options[option]) === -1) {
            console.log('%cInvalid option detected in "' + option + '".' + ' Allowed values are:' + Validator.print(refOptionType) + ' not "' + options[option] + '". ' + Validator.printLocation(path, option), printStyle);
            errorFound = true;
          } else if (optionType === 'object' && referenceOption !== "__any__") {
            path = util.copyAndExtendArray(path, option);
            Validator.parse(options[option], referenceOptions[referenceOption], path);
          }
        } else if (optionType === 'object' && referenceOption !== "__any__") {
          path = util.copyAndExtendArray(path, option);
          Validator.parse(options[option], referenceOptions[referenceOption], path);
        }
      } else if (refOptionObj['any'] === undefined) {
        // type of the field is incorrect and the field cannot be any
        console.log('%cInvalid type received for "' + option + '". Expected: ' + Validator.print(Object.keys(refOptionObj)) + '. Received [' + optionType + '] "' + options[option] + '"' + Validator.printLocation(path, option), printStyle);
        errorFound = true;
      }
    }
  }, {
    key: 'getType',
    value: function getType(object) {
      var type = typeof object;

      if (type === 'object') {
        if (object === null) {
          return 'null';
        }
        if (object instanceof Boolean) {
          return 'boolean';
        }
        if (object instanceof Number) {
          return 'number';
        }
        if (object instanceof String) {
          return 'string';
        }
        if (Array.isArray(object)) {
          return 'array';
        }
        if (object instanceof Date) {
          return 'date';
        }
        if (object.nodeType !== undefined) {
          return 'dom';
        }
        if (object._isAMomentObject === true) {
          return 'moment';
        }
        return 'object';
      } else if (type === 'number') {
        return 'number';
      } else if (type === 'boolean') {
        return 'boolean';
      } else if (type === 'string') {
        return 'string';
      } else if (type === undefined) {
        return 'undefined';
      }
      return type;
    }
  }, {
    key: 'getSuggestion',
    value: function getSuggestion(option, options, path) {
      var localSearch = Validator.findInOptions(option, options, path, false);
      var globalSearch = Validator.findInOptions(option, allOptions, [], true);

      var localSearchThreshold = 8;
      var globalSearchThreshold = 4;

      if (localSearch.indexMatch !== undefined) {
        console.log('%cUnknown option detected: "' + option + '" in ' + Validator.printLocation(localSearch.path, option, '') + 'Perhaps it was incomplete? Did you mean: "' + localSearch.indexMatch + '"?\n\n', printStyle);
      } else if (globalSearch.distance <= globalSearchThreshold && localSearch.distance > globalSearch.distance) {
        console.log('%cUnknown option detected: "' + option + '" in ' + Validator.printLocation(localSearch.path, option, '') + 'Perhaps it was misplaced? Matching option found at: ' + Validator.printLocation(globalSearch.path, globalSearch.closestMatch, ''), printStyle);
      } else if (localSearch.distance <= localSearchThreshold) {
        console.log('%cUnknown option detected: "' + option + '". Did you mean "' + localSearch.closestMatch + '"?' + Validator.printLocation(localSearch.path, option), printStyle);
      } else {
        console.log('%cUnknown option detected: "' + option + '". Did you mean one of these: ' + Validator.print(Object.keys(options)) + Validator.printLocation(path, option), printStyle);
      }

      errorFound = true;
    }

    /**
     * traverse the options in search for a match.
     * @param option
     * @param options
     * @param path
     * @param recursive
     * @returns {{closestMatch: string, path: Array, distance: number}}
     */
  }, {
    key: 'findInOptions',
    value: function findInOptions(option, options, path) {
      var recursive = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

      var min = 1e9;
      var closestMatch = '';
      var closestMatchPath = [];
      var lowerCaseOption = option.toLowerCase();
      var indexMatch = undefined;
      for (var op in options) {
        var distance = undefined;
        if (options[op].__type__ !== undefined && recursive === true) {
          var result = Validator.findInOptions(option, options[op], util.copyAndExtendArray(path, op));
          if (min > result.distance) {
            closestMatch = result.closestMatch;
            closestMatchPath = result.path;
            min = result.distance;
            indexMatch = result.indexMatch;
          }
        } else {
          if (op.toLowerCase().indexOf(lowerCaseOption) !== -1) {
            indexMatch = op;
          }
          distance = Validator.levenshteinDistance(option, op);
          if (min > distance) {
            closestMatch = op;
            closestMatchPath = util.copyArray(path);
            min = distance;
          }
        }
      }
      return { closestMatch: closestMatch, path: closestMatchPath, distance: min, indexMatch: indexMatch };
    }
  }, {
    key: 'printLocation',
    value: function printLocation(path, option) {
      var prefix = arguments.length <= 2 || arguments[2] === undefined ? 'Problem value found at: \n' : arguments[2];

      var str = '\n\n' + prefix + 'options = {\n';
      for (var i = 0; i < path.length; i++) {
        for (var j = 0; j < i + 1; j++) {
          str += '  ';
        }
        str += path[i] + ': {\n';
      }
      for (var j = 0; j < path.length + 1; j++) {
        str += '  ';
      }
      str += option + '\n';
      for (var i = 0; i < path.length + 1; i++) {
        for (var j = 0; j < path.length - i; j++) {
          str += '  ';
        }
        str += '}\n';
      }
      return str + '\n\n';
    }
  }, {
    key: 'print',
    value: function print(options) {
      return JSON.stringify(options).replace(/(\")|(\[)|(\])|(,"__type__")/g, "").replace(/(\,)/g, ', ');
    }

    // Compute the edit distance between the two given strings
    // http://en.wikibooks.org/wiki/Algorithm_Implementation/Strings/Levenshtein_distance#JavaScript
    /*
     Copyright (c) 2011 Andrei Mackenzie
      Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
      The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
      THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
     */
  }, {
    key: 'levenshteinDistance',
    value: function levenshteinDistance(a, b) {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;

      var matrix = [];

      // increment along the first column of each row
      var i;
      for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
      }

      // increment each column in the first row
      var j;
      for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
      }

      // Fill in the rest of the matrix
      for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) == a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
            Math.min(matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1)); // deletion
          }
        }
      }

      return matrix[b.length][a.length];
    }
  }]);

  return Validator;
})();

exports['default'] = Validator;
exports.printStyle = printStyle;

},{"../util":73}],73:[function(require,module,exports){
// utility functions

// first check if moment.js is already loaded in the browser window, if so,
// use this instance. Else, load via commonjs.

'use strict';

var moment = require('./module/moment');
var uuid = require('./module/uuid');

/**
 * Test whether given object is a number
 * @param {*} object
 * @return {Boolean} isNumber
 */
exports.isNumber = function (object) {
  return object instanceof Number || typeof object == 'number';
};

/**
 * Remove everything in the DOM object
 * @param DOMobject
 */
exports.recursiveDOMDelete = function (DOMobject) {
  if (DOMobject) {
    while (DOMobject.hasChildNodes() === true) {
      exports.recursiveDOMDelete(DOMobject.firstChild);
      DOMobject.removeChild(DOMobject.firstChild);
    }
  }
};

/**
 * this function gives you a range between 0 and 1 based on the min and max values in the set, the total sum of all values and the current value.
 *
 * @param min
 * @param max
 * @param total
 * @param value
 * @returns {number}
 */
exports.giveRange = function (min, max, total, value) {
  if (max == min) {
    return 0.5;
  } else {
    var scale = 1 / (max - min);
    return Math.max(0, (value - min) * scale);
  }
};

/**
 * Test whether given object is a string
 * @param {*} object
 * @return {Boolean} isString
 */
exports.isString = function (object) {
  return object instanceof String || typeof object == 'string';
};

/**
 * Test whether given object is a Date, or a String containing a Date
 * @param {Date | String} object
 * @return {Boolean} isDate
 */
exports.isDate = function (object) {
  if (object instanceof Date) {
    return true;
  } else if (exports.isString(object)) {
    // test whether this string contains a date
    var match = ASPDateRegex.exec(object);
    if (match) {
      return true;
    } else if (!isNaN(Date.parse(object))) {
      return true;
    }
  }

  return false;
};

/**
 * Create a semi UUID
 * source: http://stackoverflow.com/a/105074/1262753
 * @return {String} uuid
 */
exports.randomUUID = function () {
  return uuid.v4();
};

/**
 * assign all keys of an object that are not nested objects to a certain value (used for color objects).
 * @param obj
 * @param value
 */
exports.assignAllKeys = function (obj, value) {
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      if (typeof obj[prop] !== 'object') {
        obj[prop] = value;
      }
    }
  }
};

/**
 * Fill an object with a possibly partially defined other object. Only copies values if the a object has an object requiring values.
 * That means an object is not created on a property if only the b object has it.
 * @param obj
 * @param value
 */
exports.fillIfDefined = function (a, b) {
  var allowDeletion = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

  for (var prop in a) {
    if (b[prop] !== undefined) {
      if (typeof b[prop] !== 'object') {
        if ((b[prop] === undefined || b[prop] === null) && a[prop] !== undefined && allowDeletion === true) {
          delete a[prop];
        } else {
          a[prop] = b[prop];
        }
      } else {
        if (typeof a[prop] === 'object') {
          exports.fillIfDefined(a[prop], b[prop], allowDeletion);
        }
      }
    }
  }
};

/**
 * Extend object a with the properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Object} a
 * @param {... Object} b
 * @return {Object} a
 */
exports.protoExtend = function (a, b) {
  for (var i = 1; i < arguments.length; i++) {
    var other = arguments[i];
    for (var prop in other) {
      a[prop] = other[prop];
    }
  }
  return a;
};

/**
 * Extend object a with the properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Object} a
 * @param {... Object} b
 * @return {Object} a
 */
exports.extend = function (a, b) {
  for (var i = 1; i < arguments.length; i++) {
    var other = arguments[i];
    for (var prop in other) {
      if (other.hasOwnProperty(prop)) {
        a[prop] = other[prop];
      }
    }
  }
  return a;
};

/**
 * Extend object a with selected properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Array.<String>} props
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 */
exports.selectiveExtend = function (props, a, b) {
  if (!Array.isArray(props)) {
    throw new Error('Array with property names expected as first argument');
  }

  for (var i = 2; i < arguments.length; i++) {
    var other = arguments[i];

    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      if (other.hasOwnProperty(prop)) {
        a[prop] = other[prop];
      }
    }
  }
  return a;
};

/**
 * Extend object a with selected properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Array.<String>} props
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 */
exports.selectiveDeepExtend = function (props, a, b) {
  var allowDeletion = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

  // TODO: add support for Arrays to deepExtend
  if (Array.isArray(b)) {
    throw new TypeError('Arrays are not supported by deepExtend');
  }
  for (var i = 2; i < arguments.length; i++) {
    var other = arguments[i];
    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      if (other.hasOwnProperty(prop)) {
        if (b[prop] && b[prop].constructor === Object) {
          if (a[prop] === undefined) {
            a[prop] = {};
          }
          if (a[prop].constructor === Object) {
            exports.deepExtend(a[prop], b[prop], false, allowDeletion);
          } else {
            if (b[prop] === null && a[prop] !== undefined && allowDeletion === true) {
              delete a[prop];
            } else {
              a[prop] = b[prop];
            }
          }
        } else if (Array.isArray(b[prop])) {
          throw new TypeError('Arrays are not supported by deepExtend');
        } else {
          if (b[prop] === null && a[prop] !== undefined && allowDeletion === true) {
            delete a[prop];
          } else {
            a[prop] = b[prop];
          }
        }
      }
    }
  }
  return a;
};

/**
 * Extend object a with selected properties of object b or a series of objects
 * Only properties with defined values are copied
 * @param {Array.<String>} props
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 */
exports.selectiveNotDeepExtend = function (props, a, b) {
  var allowDeletion = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

  // TODO: add support for Arrays to deepExtend
  if (Array.isArray(b)) {
    throw new TypeError('Arrays are not supported by deepExtend');
  }
  for (var prop in b) {
    if (b.hasOwnProperty(prop)) {
      if (props.indexOf(prop) == -1) {
        if (b[prop] && b[prop].constructor === Object) {
          if (a[prop] === undefined) {
            a[prop] = {};
          }
          if (a[prop].constructor === Object) {
            exports.deepExtend(a[prop], b[prop]);
          } else {
            if (b[prop] === null && a[prop] !== undefined && allowDeletion === true) {
              delete a[prop];
            } else {
              a[prop] = b[prop];
            }
          }
        } else if (Array.isArray(b[prop])) {
          a[prop] = [];
          for (var i = 0; i < b[prop].length; i++) {
            a[prop].push(b[prop][i]);
          }
        } else {
          if (b[prop] === null && a[prop] !== undefined && allowDeletion === true) {
            delete a[prop];
          } else {
            a[prop] = b[prop];
          }
        }
      }
    }
  }
  return a;
};

/**
 * Deep extend an object a with the properties of object b
 * @param {Object} a
 * @param {Object} b
 * @param [Boolean] protoExtend --> optional parameter. If true, the prototype values will also be extended.
 *                                  (ie. the options objects that inherit from others will also get the inherited options)
 * @param [Boolean] global      --> optional parameter. If true, the values of fields that are null will not deleted
 * @returns {Object}
 */
exports.deepExtend = function (a, b, protoExtend, allowDeletion) {
  for (var prop in b) {
    if (b.hasOwnProperty(prop) || protoExtend === true) {
      if (b[prop] && b[prop].constructor === Object) {
        if (a[prop] === undefined) {
          a[prop] = {};
        }
        if (a[prop].constructor === Object) {
          exports.deepExtend(a[prop], b[prop], protoExtend);
        } else {
          if (b[prop] === null && a[prop] !== undefined && allowDeletion === true) {
            delete a[prop];
          } else {
            a[prop] = b[prop];
          }
        }
      } else if (Array.isArray(b[prop])) {
        a[prop] = [];
        for (var i = 0; i < b[prop].length; i++) {
          a[prop].push(b[prop][i]);
        }
      } else {
        if (b[prop] === null && a[prop] !== undefined && allowDeletion === true) {
          delete a[prop];
        } else {
          a[prop] = b[prop];
        }
      }
    }
  }
  return a;
};

/**
 * Test whether all elements in two arrays are equal.
 * @param {Array} a
 * @param {Array} b
 * @return {boolean} Returns true if both arrays have the same length and same
 *                   elements.
 */
exports.equalArray = function (a, b) {
  if (a.length != b.length) return false;

  for (var i = 0, len = a.length; i < len; i++) {
    if (a[i] != b[i]) return false;
  }

  return true;
};

/**
 * Convert an object to another type
 * @param {Boolean | Number | String | Date | Moment | Null | undefined} object
 * @param {String | undefined} type   Name of the type. Available types:
 *                                    'Boolean', 'Number', 'String',
 *                                    'Date', 'Moment', ISODate', 'ASPDate'.
 * @return {*} object
 * @throws Error
 */
exports.convert = function (object, type) {
  var match;

  if (object === undefined) {
    return undefined;
  }
  if (object === null) {
    return null;
  }

  if (!type) {
    return object;
  }
  if (!(typeof type === 'string') && !(type instanceof String)) {
    throw new Error('Type must be a string');
  }

  //noinspection FallthroughInSwitchStatementJS
  switch (type) {
    case 'boolean':
    case 'Boolean':
      return Boolean(object);

    case 'number':
    case 'Number':
      return Number(object.valueOf());

    case 'string':
    case 'String':
      return String(object);

    case 'Date':
      if (exports.isNumber(object)) {
        return new Date(object);
      }
      if (object instanceof Date) {
        return new Date(object.valueOf());
      } else if (moment.isMoment(object)) {
        return new Date(object.valueOf());
      }
      if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        if (match) {
          // object is an ASP date
          return new Date(Number(match[1])); // parse number
        } else {
            return moment(object).toDate(); // parse string
          }
      } else {
          throw new Error('Cannot convert object of type ' + exports.getType(object) + ' to type Date');
        }

    case 'Moment':
      if (exports.isNumber(object)) {
        return moment(object);
      }
      if (object instanceof Date) {
        return moment(object.valueOf());
      } else if (moment.isMoment(object)) {
        return moment(object);
      }
      if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        if (match) {
          // object is an ASP date
          return moment(Number(match[1])); // parse number
        } else {
            return moment(object); // parse string
          }
      } else {
          throw new Error('Cannot convert object of type ' + exports.getType(object) + ' to type Date');
        }

    case 'ISODate':
      if (exports.isNumber(object)) {
        return new Date(object);
      } else if (object instanceof Date) {
        return object.toISOString();
      } else if (moment.isMoment(object)) {
        return object.toDate().toISOString();
      } else if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        if (match) {
          // object is an ASP date
          return new Date(Number(match[1])).toISOString(); // parse number
        } else {
            return new Date(object).toISOString(); // parse string
          }
      } else {
          throw new Error('Cannot convert object of type ' + exports.getType(object) + ' to type ISODate');
        }

    case 'ASPDate':
      if (exports.isNumber(object)) {
        return '/Date(' + object + ')/';
      } else if (object instanceof Date) {
        return '/Date(' + object.valueOf() + ')/';
      } else if (exports.isString(object)) {
        match = ASPDateRegex.exec(object);
        var value;
        if (match) {
          // object is an ASP date
          value = new Date(Number(match[1])).valueOf(); // parse number
        } else {
            value = new Date(object).valueOf(); // parse string
          }
        return '/Date(' + value + ')/';
      } else {
        throw new Error('Cannot convert object of type ' + exports.getType(object) + ' to type ASPDate');
      }

    default:
      throw new Error('Unknown type "' + type + '"');
  }
};

// parse ASP.Net Date pattern,
// for example '/Date(1198908717056)/' or '/Date(1198908717056-0700)/'
// code from http://momentjs.com/
var ASPDateRegex = /^\/?Date\((\-?\d+)/i;

/**
 * Get the type of an object, for example exports.getType([]) returns 'Array'
 * @param {*} object
 * @return {String} type
 */
exports.getType = function (object) {
  var type = typeof object;

  if (type == 'object') {
    if (object === null) {
      return 'null';
    }
    if (object instanceof Boolean) {
      return 'Boolean';
    }
    if (object instanceof Number) {
      return 'Number';
    }
    if (object instanceof String) {
      return 'String';
    }
    if (Array.isArray(object)) {
      return 'Array';
    }
    if (object instanceof Date) {
      return 'Date';
    }
    return 'Object';
  } else if (type == 'number') {
    return 'Number';
  } else if (type == 'boolean') {
    return 'Boolean';
  } else if (type == 'string') {
    return 'String';
  } else if (type === undefined) {
    return 'undefined';
  }

  return type;
};

/**
 * Used to extend an array and copy it. This is used to propagate paths recursively.
 *
 * @param arr
 * @param newValue
 * @returns {Array}
 */
exports.copyAndExtendArray = function (arr, newValue) {
  var newArr = [];
  for (var i = 0; i < arr.length; i++) {
    newArr.push(arr[i]);
  }
  newArr.push(newValue);
  return newArr;
};

/**
 * Used to extend an array and copy it. This is used to propagate paths recursively.
 *
 * @param arr
 * @param newValue
 * @returns {Array}
 */
exports.copyArray = function (arr) {
  var newArr = [];
  for (var i = 0; i < arr.length; i++) {
    newArr.push(arr[i]);
  }
  return newArr;
};

/**
 * Retrieve the absolute left value of a DOM element
 * @param {Element} elem        A dom element, for example a div
 * @return {number} left        The absolute left position of this element
 *                              in the browser page.
 */
exports.getAbsoluteLeft = function (elem) {
  return elem.getBoundingClientRect().left;
};

/**
 * Retrieve the absolute top value of a DOM element
 * @param {Element} elem        A dom element, for example a div
 * @return {number} top        The absolute top position of this element
 *                              in the browser page.
 */
exports.getAbsoluteTop = function (elem) {
  return elem.getBoundingClientRect().top;
};

/**
 * add a className to the given elements style
 * @param {Element} elem
 * @param {String} className
 */
exports.addClassName = function (elem, className) {
  var classes = elem.className.split(' ');
  if (classes.indexOf(className) == -1) {
    classes.push(className); // add the class to the array
    elem.className = classes.join(' ');
  }
};

/**
 * add a className to the given elements style
 * @param {Element} elem
 * @param {String} className
 */
exports.removeClassName = function (elem, className) {
  var classes = elem.className.split(' ');
  var index = classes.indexOf(className);
  if (index != -1) {
    classes.splice(index, 1); // remove the class from the array
    elem.className = classes.join(' ');
  }
};

/**
 * For each method for both arrays and objects.
 * In case of an array, the built-in Array.forEach() is applied.
 * In case of an Object, the method loops over all properties of the object.
 * @param {Object | Array} object   An Object or Array
 * @param {function} callback       Callback method, called for each item in
 *                                  the object or array with three parameters:
 *                                  callback(value, index, object)
 */
exports.forEach = function (object, callback) {
  var i, len;
  if (Array.isArray(object)) {
    // array
    for (i = 0, len = object.length; i < len; i++) {
      callback(object[i], i, object);
    }
  } else {
    // object
    for (i in object) {
      if (object.hasOwnProperty(i)) {
        callback(object[i], i, object);
      }
    }
  }
};

/**
 * Convert an object into an array: all objects properties are put into the
 * array. The resulting array is unordered.
 * @param {Object} object
 * @param {Array} array
 */
exports.toArray = function (object) {
  var array = [];

  for (var prop in object) {
    if (object.hasOwnProperty(prop)) array.push(object[prop]);
  }

  return array;
};

/**
 * Update a property in an object
 * @param {Object} object
 * @param {String} key
 * @param {*} value
 * @return {Boolean} changed
 */
exports.updateProperty = function (object, key, value) {
  if (object[key] !== value) {
    object[key] = value;
    return true;
  } else {
    return false;
  }
};

/**
 * Throttle the given function to be only executed once every `wait` milliseconds
 * @param {function} fn
 * @param {number} wait    Time in milliseconds
 * @returns {function} Returns the throttled function
 */
exports.throttle = function (fn, wait) {
  var timeout = null;
  var needExecution = false;

  return function throttled() {
    if (!timeout) {
      needExecution = false;
      fn();

      timeout = setTimeout(function () {
        timeout = null;
        if (needExecution) {
          throttled();
        }
      }, wait);
    } else {
      needExecution = true;
    }
  };
};

/**
 * Add and event listener. Works for all browsers
 * @param {Element}     element    An html element
 * @param {string}      action     The action, for example "click",
 *                                 without the prefix "on"
 * @param {function}    listener   The callback function to be executed
 * @param {boolean}     [useCapture]
 */
exports.addEventListener = function (element, action, listener, useCapture) {
  if (element.addEventListener) {
    if (useCapture === undefined) useCapture = false;

    if (action === "mousewheel" && navigator.userAgent.indexOf("Firefox") >= 0) {
      action = "DOMMouseScroll"; // For Firefox
    }

    element.addEventListener(action, listener, useCapture);
  } else {
    element.attachEvent("on" + action, listener); // IE browsers
  }
};

/**
 * Remove an event listener from an element
 * @param {Element}     element         An html dom element
 * @param {string}      action          The name of the event, for example "mousedown"
 * @param {function}    listener        The listener function
 * @param {boolean}     [useCapture]
 */
exports.removeEventListener = function (element, action, listener, useCapture) {
  if (element.removeEventListener) {
    // non-IE browsers
    if (useCapture === undefined) useCapture = false;

    if (action === "mousewheel" && navigator.userAgent.indexOf("Firefox") >= 0) {
      action = "DOMMouseScroll"; // For Firefox
    }

    element.removeEventListener(action, listener, useCapture);
  } else {
    // IE browsers
    element.detachEvent("on" + action, listener);
  }
};

/**
 * Cancels the event if it is cancelable, without stopping further propagation of the event.
 */
exports.preventDefault = function (event) {
  if (!event) event = window.event;

  if (event.preventDefault) {
    event.preventDefault(); // non-IE browsers
  } else {
      event.returnValue = false; // IE browsers
    }
};

/**
 * Get HTML element which is the target of the event
 * @param {Event} event
 * @return {Element} target element
 */
exports.getTarget = function (event) {
  // code from http://www.quirksmode.org/js/events_properties.html
  if (!event) {
    event = window.event;
  }

  var target;

  if (event.target) {
    target = event.target;
  } else if (event.srcElement) {
    target = event.srcElement;
  }

  if (target.nodeType != undefined && target.nodeType == 3) {
    // defeat Safari bug
    target = target.parentNode;
  }

  return target;
};

/**
 * Check if given element contains given parent somewhere in the DOM tree
 * @param {Element} element
 * @param {Element} parent
 */
exports.hasParent = function (element, parent) {
  var e = element;

  while (e) {
    if (e === parent) {
      return true;
    }
    e = e.parentNode;
  }

  return false;
};

exports.option = {};

/**
 * Convert a value into a boolean
 * @param {Boolean | function | undefined} value
 * @param {Boolean} [defaultValue]
 * @returns {Boolean} bool
 */
exports.option.asBoolean = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (value != null) {
    return value != false;
  }

  return defaultValue || null;
};

/**
 * Convert a value into a number
 * @param {Boolean | function | undefined} value
 * @param {Number} [defaultValue]
 * @returns {Number} number
 */
exports.option.asNumber = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (value != null) {
    return Number(value) || defaultValue || null;
  }

  return defaultValue || null;
};

/**
 * Convert a value into a string
 * @param {String | function | undefined} value
 * @param {String} [defaultValue]
 * @returns {String} str
 */
exports.option.asString = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (value != null) {
    return String(value);
  }

  return defaultValue || null;
};

/**
 * Convert a size or location into a string with pixels or a percentage
 * @param {String | Number | function | undefined} value
 * @param {String} [defaultValue]
 * @returns {String} size
 */
exports.option.asSize = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  if (exports.isString(value)) {
    return value;
  } else if (exports.isNumber(value)) {
    return value + 'px';
  } else {
    return defaultValue || null;
  }
};

/**
 * Convert a value into a DOM element
 * @param {HTMLElement | function | undefined} value
 * @param {HTMLElement} [defaultValue]
 * @returns {HTMLElement | null} dom
 */
exports.option.asElement = function (value, defaultValue) {
  if (typeof value == 'function') {
    value = value();
  }

  return value || defaultValue || null;
};

/**
 * http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
 *
 * @param {String} hex
 * @returns {{r: *, g: *, b: *}} | 255 range
 */
exports.hexToRGB = function (hex) {
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function (m, r, g, b) {
    return r + r + g + g + b + b;
  });
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * This function takes color in hex format or rgb() or rgba() format and overrides the opacity. Returns rgba() string.
 * @param color
 * @param opacity
 * @returns {*}
 */
exports.overrideOpacity = function (color, opacity) {
  if (color.indexOf("rgba") != -1) {
    return color;
  } else if (color.indexOf("rgb") != -1) {
    var rgb = color.substr(color.indexOf("(") + 1).replace(")", "").split(",");
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + opacity + ")";
  } else {
    var rgb = exports.hexToRGB(color);
    if (rgb == null) {
      return color;
    } else {
      return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + opacity + ")";
    }
  }
};

/**
 *
 * @param red     0 -- 255
 * @param green   0 -- 255
 * @param blue    0 -- 255
 * @returns {string}
 * @constructor
 */
exports.RGBToHex = function (red, green, blue) {
  return "#" + ((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1);
};

/**
 * Parse a color property into an object with border, background, and
 * highlight colors
 * @param {Object | String} color
 * @return {Object} colorObject
 */
exports.parseColor = function (color) {
  var c;
  if (exports.isString(color) === true) {
    if (exports.isValidRGB(color) === true) {
      var rgb = color.substr(4).substr(0, color.length - 5).split(',').map(function (value) {
        return parseInt(value);
      });
      color = exports.RGBToHex(rgb[0], rgb[1], rgb[2]);
    }
    if (exports.isValidHex(color) === true) {
      var hsv = exports.hexToHSV(color);
      var lighterColorHSV = { h: hsv.h, s: hsv.s * 0.8, v: Math.min(1, hsv.v * 1.02) };
      var darkerColorHSV = { h: hsv.h, s: Math.min(1, hsv.s * 1.25), v: hsv.v * 0.8 };
      var darkerColorHex = exports.HSVToHex(darkerColorHSV.h, darkerColorHSV.s, darkerColorHSV.v);
      var lighterColorHex = exports.HSVToHex(lighterColorHSV.h, lighterColorHSV.s, lighterColorHSV.v);
      c = {
        background: color,
        border: darkerColorHex,
        highlight: {
          background: lighterColorHex,
          border: darkerColorHex
        },
        hover: {
          background: lighterColorHex,
          border: darkerColorHex
        }
      };
    } else {
      c = {
        background: color,
        border: color,
        highlight: {
          background: color,
          border: color
        },
        hover: {
          background: color,
          border: color
        }
      };
    }
  } else {
    c = {};
    c.background = color.background || undefined;
    c.border = color.border || undefined;

    if (exports.isString(color.highlight)) {
      c.highlight = {
        border: color.highlight,
        background: color.highlight
      };
    } else {
      c.highlight = {};
      c.highlight.background = color.highlight && color.highlight.background || undefined;
      c.highlight.border = color.highlight && color.highlight.border || undefined;
    }

    if (exports.isString(color.hover)) {
      c.hover = {
        border: color.hover,
        background: color.hover
      };
    } else {
      c.hover = {};
      c.hover.background = color.hover && color.hover.background || undefined;
      c.hover.border = color.hover && color.hover.border || undefined;
    }
  }

  return c;
};

/**
 * http://www.javascripter.net/faq/rgb2hsv.htm
 *
 * @param red
 * @param green
 * @param blue
 * @returns {*}
 * @constructor
 */
exports.RGBToHSV = function (red, green, blue) {
  red = red / 255;green = green / 255;blue = blue / 255;
  var minRGB = Math.min(red, Math.min(green, blue));
  var maxRGB = Math.max(red, Math.max(green, blue));

  // Black-gray-white
  if (minRGB == maxRGB) {
    return { h: 0, s: 0, v: minRGB };
  }

  // Colors other than black-gray-white:
  var d = red == minRGB ? green - blue : blue == minRGB ? red - green : blue - red;
  var h = red == minRGB ? 3 : blue == minRGB ? 1 : 5;
  var hue = 60 * (h - d / (maxRGB - minRGB)) / 360;
  var saturation = (maxRGB - minRGB) / maxRGB;
  var value = maxRGB;
  return { h: hue, s: saturation, v: value };
};

var cssUtil = {
  // split a string with css styles into an object with key/values
  split: function split(cssText) {
    var styles = {};

    cssText.split(';').forEach(function (style) {
      if (style.trim() != '') {
        var parts = style.split(':');
        var key = parts[0].trim();
        var value = parts[1].trim();
        styles[key] = value;
      }
    });

    return styles;
  },

  // build a css text string from an object with key/values
  join: function join(styles) {
    return Object.keys(styles).map(function (key) {
      return key + ': ' + styles[key];
    }).join('; ');
  }
};

/**
 * Append a string with css styles to an element
 * @param {Element} element
 * @param {String} cssText
 */
exports.addCssText = function (element, cssText) {
  var currentStyles = cssUtil.split(element.style.cssText);
  var newStyles = cssUtil.split(cssText);
  var styles = exports.extend(currentStyles, newStyles);

  element.style.cssText = cssUtil.join(styles);
};

/**
 * Remove a string with css styles from an element
 * @param {Element} element
 * @param {String} cssText
 */
exports.removeCssText = function (element, cssText) {
  var styles = cssUtil.split(element.style.cssText);
  var removeStyles = cssUtil.split(cssText);

  for (var key in removeStyles) {
    if (removeStyles.hasOwnProperty(key)) {
      delete styles[key];
    }
  }

  element.style.cssText = cssUtil.join(styles);
};

/**
 * https://gist.github.com/mjijackson/5311256
 * @param h
 * @param s
 * @param v
 * @returns {{r: number, g: number, b: number}}
 * @constructor
 */
exports.HSVToRGB = function (h, s, v) {
  var r, g, b;

  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      r = v, g = t, b = p;break;
    case 1:
      r = q, g = v, b = p;break;
    case 2:
      r = p, g = v, b = t;break;
    case 3:
      r = p, g = q, b = v;break;
    case 4:
      r = t, g = p, b = v;break;
    case 5:
      r = v, g = p, b = q;break;
  }

  return { r: Math.floor(r * 255), g: Math.floor(g * 255), b: Math.floor(b * 255) };
};

exports.HSVToHex = function (h, s, v) {
  var rgb = exports.HSVToRGB(h, s, v);
  return exports.RGBToHex(rgb.r, rgb.g, rgb.b);
};

exports.hexToHSV = function (hex) {
  var rgb = exports.hexToRGB(hex);
  return exports.RGBToHSV(rgb.r, rgb.g, rgb.b);
};

exports.isValidHex = function (hex) {
  var isOk = /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(hex);
  return isOk;
};

exports.isValidRGB = function (rgb) {
  rgb = rgb.replace(" ", "");
  var isOk = /rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/i.test(rgb);
  return isOk;
};
exports.isValidRGBA = function (rgba) {
  rgba = rgba.replace(" ", "");
  var isOk = /rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),(.{1,3})\)/i.test(rgba);
  return isOk;
};

/**
 * This recursively redirects the prototype of JSON objects to the referenceObject
 * This is used for default options.
 *
 * @param referenceObject
 * @returns {*}
 */
exports.selectiveBridgeObject = function (fields, referenceObject) {
  if (typeof referenceObject == "object") {
    var objectTo = Object.create(referenceObject);
    for (var i = 0; i < fields.length; i++) {
      if (referenceObject.hasOwnProperty(fields[i])) {
        if (typeof referenceObject[fields[i]] == "object") {
          objectTo[fields[i]] = exports.bridgeObject(referenceObject[fields[i]]);
        }
      }
    }
    return objectTo;
  } else {
    return null;
  }
};

/**
 * This recursively redirects the prototype of JSON objects to the referenceObject
 * This is used for default options.
 *
 * @param referenceObject
 * @returns {*}
 */
exports.bridgeObject = function (referenceObject) {
  if (typeof referenceObject == "object") {
    var objectTo = Object.create(referenceObject);
    for (var i in referenceObject) {
      if (referenceObject.hasOwnProperty(i)) {
        if (typeof referenceObject[i] == "object") {
          objectTo[i] = exports.bridgeObject(referenceObject[i]);
        }
      }
    }
    return objectTo;
  } else {
    return null;
  }
};

/**
 * This method provides a stable sort implementation, very fast for presorted data
 *
 * @param a the array
 * @param a order comparator
 * @returns {the array}
 */
exports.insertSort = function (a, compare) {
  for (var i = 0; i < a.length; i++) {
    var k = a[i];
    for (var j = i; j > 0 && compare(k, a[j - 1]) < 0; j--) {
      a[j] = a[j - 1];
    }
    a[j] = k;
  }
  return a;
};

/**
 * this is used to set the options of subobjects in the options object. A requirement of these subobjects
 * is that they have an 'enabled' element which is optional for the user but mandatory for the program.
 *
 * @param [object] mergeTarget | this is either this.options or the options used for the groups.
 * @param [object] options     | options
 * @param [String] option      | this is the option key in the options argument
 * @private
 */
exports.mergeOptions = function (mergeTarget, options, option) {
  var allowDeletion = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];
  var globalOptions = arguments.length <= 4 || arguments[4] === undefined ? {} : arguments[4];

  if (options[option] === null) {
    mergeTarget[option] = Object.create(globalOptions[option]);
  } else {
    if (options[option] !== undefined) {
      if (typeof options[option] === 'boolean') {
        mergeTarget[option].enabled = options[option];
      } else {
        if (options[option].enabled === undefined) {
          mergeTarget[option].enabled = true;
        }
        for (var prop in options[option]) {
          if (options[option].hasOwnProperty(prop)) {
            mergeTarget[option][prop] = options[option][prop];
          }
        }
      }
    }
  }
};

/**
 * This function does a binary search for a visible item in a sorted list. If we find a visible item, the code that uses
 * this function will then iterate in both directions over this sorted list to find all visible items.
 *
 * @param {Item[]} orderedItems       | Items ordered by start
 * @param {function} searchFunction   | -1 is lower, 0 is found, 1 is higher
 * @param {String} field
 * @param {String} field2
 * @returns {number}
 * @private
 */
exports.binarySearchCustom = function (orderedItems, searchFunction, field, field2) {
  var maxIterations = 10000;
  var iteration = 0;
  var low = 0;
  var high = orderedItems.length - 1;

  while (low <= high && iteration < maxIterations) {
    var middle = Math.floor((low + high) / 2);

    var item = orderedItems[middle];
    var value = field2 === undefined ? item[field] : item[field][field2];

    var searchResult = searchFunction(value);
    if (searchResult == 0) {
      // jihaa, found a visible item!
      return middle;
    } else if (searchResult == -1) {
      // it is too small --> increase low
      low = middle + 1;
    } else {
      // it is too big --> decrease high
      high = middle - 1;
    }

    iteration++;
  }

  return -1;
};

/**
 * This function does a binary search for a specific value in a sorted array. If it does not exist but is in between of
 * two values, we return either the one before or the one after, depending on user input
 * If it is found, we return the index, else -1.
 *
 * @param {Array} orderedItems
 * @param {{start: number, end: number}} target
 * @param {String} field
 * @param {String} sidePreference   'before' or 'after'
 * @returns {number}
 * @private
 */
exports.binarySearchValue = function (orderedItems, target, field, sidePreference) {
  var maxIterations = 10000;
  var iteration = 0;
  var low = 0;
  var high = orderedItems.length - 1;
  var prevValue, value, nextValue, middle;

  while (low <= high && iteration < maxIterations) {
    // get a new guess
    middle = Math.floor(0.5 * (high + low));
    prevValue = orderedItems[Math.max(0, middle - 1)][field];
    value = orderedItems[middle][field];
    nextValue = orderedItems[Math.min(orderedItems.length - 1, middle + 1)][field];

    if (value == target) {
      // we found the target
      return middle;
    } else if (prevValue < target && value > target) {
      // target is in between of the previous and the current
      return sidePreference == 'before' ? Math.max(0, middle - 1) : middle;
    } else if (value < target && nextValue > target) {
      // target is in between of the current and the next
      return sidePreference == 'before' ? middle : Math.min(orderedItems.length - 1, middle + 1);
    } else {
      // didnt find the target, we need to change our boundaries.
      if (value < target) {
        // it is too small --> increase low
        low = middle + 1;
      } else {
        // it is too big --> decrease high
        high = middle - 1;
      }
    }
    iteration++;
  }

  // didnt find anything. Return -1.
  return -1;
};

/*
 * Easing Functions - inspired from http://gizma.com/easing/
 * only considering the t value for the range [0, 1] => [0, 1]
 * https://gist.github.com/gre/1650294
 */
exports.easingFunctions = {
  // no easing, no acceleration
  linear: function linear(t) {
    return t;
  },
  // accelerating from zero velocity
  easeInQuad: function easeInQuad(t) {
    return t * t;
  },
  // decelerating to zero velocity
  easeOutQuad: function easeOutQuad(t) {
    return t * (2 - t);
  },
  // acceleration until halfway, then deceleration
  easeInOutQuad: function easeInOutQuad(t) {
    return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },
  // accelerating from zero velocity
  easeInCubic: function easeInCubic(t) {
    return t * t * t;
  },
  // decelerating to zero velocity
  easeOutCubic: function easeOutCubic(t) {
    return --t * t * t + 1;
  },
  // acceleration until halfway, then deceleration
  easeInOutCubic: function easeInOutCubic(t) {
    return t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },
  // accelerating from zero velocity
  easeInQuart: function easeInQuart(t) {
    return t * t * t * t;
  },
  // decelerating to zero velocity
  easeOutQuart: function easeOutQuart(t) {
    return 1 - --t * t * t * t;
  },
  // acceleration until halfway, then deceleration
  easeInOutQuart: function easeInOutQuart(t) {
    return t < .5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t;
  },
  // accelerating from zero velocity
  easeInQuint: function easeInQuint(t) {
    return t * t * t * t * t;
  },
  // decelerating to zero velocity
  easeOutQuint: function easeOutQuint(t) {
    return 1 + --t * t * t * t * t;
  },
  // acceleration until halfway, then deceleration
  easeInOutQuint: function easeInOutQuint(t) {
    return t < .5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;
  }
};

},{"./module/moment":7,"./module/uuid":8}],74:[function(require,module,exports){

/**
 * Expose `Emitter`.
 */

module.exports = Emitter;

/**
 * Initialize a new `Emitter`.
 *
 * @api public
 */

function Emitter(obj) {
  if (obj) return mixin(obj);
};

/**
 * Mixin the emitter properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */

function mixin(obj) {
  for (var key in Emitter.prototype) {
    obj[key] = Emitter.prototype[key];
  }
  return obj;
}

/**
 * Listen on the given `event` with `fn`.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.on =
Emitter.prototype.addEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};
  (this._callbacks[event] = this._callbacks[event] || [])
    .push(fn);
  return this;
};

/**
 * Adds an `event` listener that will be invoked a single
 * time then automatically removed.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.once = function(event, fn){
  var self = this;
  this._callbacks = this._callbacks || {};

  function on() {
    self.off(event, on);
    fn.apply(this, arguments);
  }

  on.fn = fn;
  this.on(event, on);
  return this;
};

/**
 * Remove the given callback for `event` or all
 * registered callbacks.
 *
 * @param {String} event
 * @param {Function} fn
 * @return {Emitter}
 * @api public
 */

Emitter.prototype.off =
Emitter.prototype.removeListener =
Emitter.prototype.removeAllListeners =
Emitter.prototype.removeEventListener = function(event, fn){
  this._callbacks = this._callbacks || {};

  // all
  if (0 == arguments.length) {
    this._callbacks = {};
    return this;
  }

  // specific event
  var callbacks = this._callbacks[event];
  if (!callbacks) return this;

  // remove all handlers
  if (1 == arguments.length) {
    delete this._callbacks[event];
    return this;
  }

  // remove specific handler
  var cb;
  for (var i = 0; i < callbacks.length; i++) {
    cb = callbacks[i];
    if (cb === fn || cb.fn === fn) {
      callbacks.splice(i, 1);
      break;
    }
  }
  return this;
};

/**
 * Emit `event` with the given args.
 *
 * @param {String} event
 * @param {Mixed} ...
 * @return {Emitter}
 */

Emitter.prototype.emit = function(event){
  this._callbacks = this._callbacks || {};
  var args = [].slice.call(arguments, 1)
    , callbacks = this._callbacks[event];

  if (callbacks) {
    callbacks = callbacks.slice(0);
    for (var i = 0, len = callbacks.length; i < len; ++i) {
      callbacks[i].apply(this, args);
    }
  }

  return this;
};

/**
 * Return array of callbacks for `event`.
 *
 * @param {String} event
 * @return {Array}
 * @api public
 */

Emitter.prototype.listeners = function(event){
  this._callbacks = this._callbacks || {};
  return this._callbacks[event] || [];
};

/**
 * Check if this emitter has `event` handlers.
 *
 * @param {String} event
 * @return {Boolean}
 * @api public
 */

Emitter.prototype.hasListeners = function(event){
  return !! this.listeners(event).length;
};

},{}],75:[function(require,module,exports){
/*! Hammer.JS - v2.0.6 - 2015-12-23
 * http://hammerjs.github.io/
 *
 * Copyright (c) 2015 Jorik Tangelder;
 * Licensed under the  license */
(function(window, document, exportName, undefined) {
  'use strict';

var VENDOR_PREFIXES = ['', 'webkit', 'Moz', 'MS', 'ms', 'o'];
var TEST_ELEMENT = document.createElement('div');

var TYPE_FUNCTION = 'function';

var round = Math.round;
var abs = Math.abs;
var now = Date.now;

/**
 * set a timeout with a given scope
 * @param {Function} fn
 * @param {Number} timeout
 * @param {Object} context
 * @returns {number}
 */
function setTimeoutContext(fn, timeout, context) {
    return setTimeout(bindFn(fn, context), timeout);
}

/**
 * if the argument is an array, we want to execute the fn on each entry
 * if it aint an array we don't want to do a thing.
 * this is used by all the methods that accept a single and array argument.
 * @param {*|Array} arg
 * @param {String} fn
 * @param {Object} [context]
 * @returns {Boolean}
 */
function invokeArrayArg(arg, fn, context) {
    if (Array.isArray(arg)) {
        each(arg, context[fn], context);
        return true;
    }
    return false;
}

/**
 * walk objects and arrays
 * @param {Object} obj
 * @param {Function} iterator
 * @param {Object} context
 */
function each(obj, iterator, context) {
    var i;

    if (!obj) {
        return;
    }

    if (obj.forEach) {
        obj.forEach(iterator, context);
    } else if (obj.length !== undefined) {
        i = 0;
        while (i < obj.length) {
            iterator.call(context, obj[i], i, obj);
            i++;
        }
    } else {
        for (i in obj) {
            obj.hasOwnProperty(i) && iterator.call(context, obj[i], i, obj);
        }
    }
}

/**
 * wrap a method with a deprecation warning and stack trace
 * @param {Function} method
 * @param {String} name
 * @param {String} message
 * @returns {Function} A new function wrapping the supplied method.
 */
function deprecate(method, name, message) {
    var deprecationMessage = 'DEPRECATED METHOD: ' + name + '\n' + message + ' AT \n';
    return function() {
        var e = new Error('get-stack-trace');
        var stack = e && e.stack ? e.stack.replace(/^[^\(]+?[\n$]/gm, '')
            .replace(/^\s+at\s+/gm, '')
            .replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@') : 'Unknown Stack Trace';

        var log = window.console && (window.console.warn || window.console.log);
        if (log) {
            log.call(window.console, deprecationMessage, stack);
        }
        return method.apply(this, arguments);
    };
}

/**
 * extend object.
 * means that properties in dest will be overwritten by the ones in src.
 * @param {Object} target
 * @param {...Object} objects_to_assign
 * @returns {Object} target
 */
var assign;
if (typeof Object.assign !== 'function') {
    assign = function assign(target) {
        if (target === undefined || target === null) {
            throw new TypeError('Cannot convert undefined or null to object');
        }

        var output = Object(target);
        for (var index = 1; index < arguments.length; index++) {
            var source = arguments[index];
            if (source !== undefined && source !== null) {
                for (var nextKey in source) {
                    if (source.hasOwnProperty(nextKey)) {
                        output[nextKey] = source[nextKey];
                    }
                }
            }
        }
        return output;
    };
} else {
    assign = Object.assign;
}

/**
 * extend object.
 * means that properties in dest will be overwritten by the ones in src.
 * @param {Object} dest
 * @param {Object} src
 * @param {Boolean=false} [merge]
 * @returns {Object} dest
 */
var extend = deprecate(function extend(dest, src, merge) {
    var keys = Object.keys(src);
    var i = 0;
    while (i < keys.length) {
        if (!merge || (merge && dest[keys[i]] === undefined)) {
            dest[keys[i]] = src[keys[i]];
        }
        i++;
    }
    return dest;
}, 'extend', 'Use `assign`.');

/**
 * merge the values from src in the dest.
 * means that properties that exist in dest will not be overwritten by src
 * @param {Object} dest
 * @param {Object} src
 * @returns {Object} dest
 */
var merge = deprecate(function merge(dest, src) {
    return extend(dest, src, true);
}, 'merge', 'Use `assign`.');

/**
 * simple class inheritance
 * @param {Function} child
 * @param {Function} base
 * @param {Object} [properties]
 */
function inherit(child, base, properties) {
    var baseP = base.prototype,
        childP;

    childP = child.prototype = Object.create(baseP);
    childP.constructor = child;
    childP._super = baseP;

    if (properties) {
        assign(childP, properties);
    }
}

/**
 * simple function bind
 * @param {Function} fn
 * @param {Object} context
 * @returns {Function}
 */
function bindFn(fn, context) {
    return function boundFn() {
        return fn.apply(context, arguments);
    };
}

/**
 * let a boolean value also be a function that must return a boolean
 * this first item in args will be used as the context
 * @param {Boolean|Function} val
 * @param {Array} [args]
 * @returns {Boolean}
 */
function boolOrFn(val, args) {
    if (typeof val == TYPE_FUNCTION) {
        return val.apply(args ? args[0] || undefined : undefined, args);
    }
    return val;
}

/**
 * use the val2 when val1 is undefined
 * @param {*} val1
 * @param {*} val2
 * @returns {*}
 */
function ifUndefined(val1, val2) {
    return (val1 === undefined) ? val2 : val1;
}

/**
 * addEventListener with multiple events at once
 * @param {EventTarget} target
 * @param {String} types
 * @param {Function} handler
 */
function addEventListeners(target, types, handler) {
    each(splitStr(types), function(type) {
        target.addEventListener(type, handler, false);
    });
}

/**
 * removeEventListener with multiple events at once
 * @param {EventTarget} target
 * @param {String} types
 * @param {Function} handler
 */
function removeEventListeners(target, types, handler) {
    each(splitStr(types), function(type) {
        target.removeEventListener(type, handler, false);
    });
}

/**
 * find if a node is in the given parent
 * @method hasParent
 * @param {HTMLElement} node
 * @param {HTMLElement} parent
 * @return {Boolean} found
 */
function hasParent(node, parent) {
    while (node) {
        if (node == parent) {
            return true;
        }
        node = node.parentNode;
    }
    return false;
}

/**
 * small indexOf wrapper
 * @param {String} str
 * @param {String} find
 * @returns {Boolean} found
 */
function inStr(str, find) {
    return str.indexOf(find) > -1;
}

/**
 * split string on whitespace
 * @param {String} str
 * @returns {Array} words
 */
function splitStr(str) {
    return str.trim().split(/\s+/g);
}

/**
 * find if a array contains the object using indexOf or a simple polyFill
 * @param {Array} src
 * @param {String} find
 * @param {String} [findByKey]
 * @return {Boolean|Number} false when not found, or the index
 */
function inArray(src, find, findByKey) {
    if (src.indexOf && !findByKey) {
        return src.indexOf(find);
    } else {
        var i = 0;
        while (i < src.length) {
            if ((findByKey && src[i][findByKey] == find) || (!findByKey && src[i] === find)) {
                return i;
            }
            i++;
        }
        return -1;
    }
}

/**
 * convert array-like objects to real arrays
 * @param {Object} obj
 * @returns {Array}
 */
function toArray(obj) {
    return Array.prototype.slice.call(obj, 0);
}

/**
 * unique array with objects based on a key (like 'id') or just by the array's value
 * @param {Array} src [{id:1},{id:2},{id:1}]
 * @param {String} [key]
 * @param {Boolean} [sort=False]
 * @returns {Array} [{id:1},{id:2}]
 */
function uniqueArray(src, key, sort) {
    var results = [];
    var values = [];
    var i = 0;

    while (i < src.length) {
        var val = key ? src[i][key] : src[i];
        if (inArray(values, val) < 0) {
            results.push(src[i]);
        }
        values[i] = val;
        i++;
    }

    if (sort) {
        if (!key) {
            results = results.sort();
        } else {
            results = results.sort(function sortUniqueArray(a, b) {
                return a[key] > b[key];
            });
        }
    }

    return results;
}

/**
 * get the prefixed property
 * @param {Object} obj
 * @param {String} property
 * @returns {String|Undefined} prefixed
 */
function prefixed(obj, property) {
    var prefix, prop;
    var camelProp = property[0].toUpperCase() + property.slice(1);

    var i = 0;
    while (i < VENDOR_PREFIXES.length) {
        prefix = VENDOR_PREFIXES[i];
        prop = (prefix) ? prefix + camelProp : property;

        if (prop in obj) {
            return prop;
        }
        i++;
    }
    return undefined;
}

/**
 * get a unique id
 * @returns {number} uniqueId
 */
var _uniqueId = 1;
function uniqueId() {
    return _uniqueId++;
}

/**
 * get the window object of an element
 * @param {HTMLElement} element
 * @returns {DocumentView|Window}
 */
function getWindowForElement(element) {
    var doc = element.ownerDocument || element;
    return (doc.defaultView || doc.parentWindow || window);
}

var MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;

var SUPPORT_TOUCH = ('ontouchstart' in window);
var SUPPORT_POINTER_EVENTS = prefixed(window, 'PointerEvent') !== undefined;
var SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);

var INPUT_TYPE_TOUCH = 'touch';
var INPUT_TYPE_PEN = 'pen';
var INPUT_TYPE_MOUSE = 'mouse';
var INPUT_TYPE_KINECT = 'kinect';

var COMPUTE_INTERVAL = 25;

var INPUT_START = 1;
var INPUT_MOVE = 2;
var INPUT_END = 4;
var INPUT_CANCEL = 8;

var DIRECTION_NONE = 1;
var DIRECTION_LEFT = 2;
var DIRECTION_RIGHT = 4;
var DIRECTION_UP = 8;
var DIRECTION_DOWN = 16;

var DIRECTION_HORIZONTAL = DIRECTION_LEFT | DIRECTION_RIGHT;
var DIRECTION_VERTICAL = DIRECTION_UP | DIRECTION_DOWN;
var DIRECTION_ALL = DIRECTION_HORIZONTAL | DIRECTION_VERTICAL;

var PROPS_XY = ['x', 'y'];
var PROPS_CLIENT_XY = ['clientX', 'clientY'];

/**
 * create new input type manager
 * @param {Manager} manager
 * @param {Function} callback
 * @returns {Input}
 * @constructor
 */
function Input(manager, callback) {
    var self = this;
    this.manager = manager;
    this.callback = callback;
    this.element = manager.element;
    this.target = manager.options.inputTarget;

    // smaller wrapper around the handler, for the scope and the enabled state of the manager,
    // so when disabled the input events are completely bypassed.
    this.domHandler = function(ev) {
        if (boolOrFn(manager.options.enable, [manager])) {
            self.handler(ev);
        }
    };

    this.init();

}

Input.prototype = {
    /**
     * should handle the inputEvent data and trigger the callback
     * @virtual
     */
    handler: function() { },

    /**
     * bind the events
     */
    init: function() {
        this.evEl && addEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && addEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && addEventListeners(getWindowForElement(this.element), this.evWin, this.domHandler);
    },

    /**
     * unbind the events
     */
    destroy: function() {
        this.evEl && removeEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && removeEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && removeEventListeners(getWindowForElement(this.element), this.evWin, this.domHandler);
    }
};

/**
 * create new input type manager
 * called by the Manager constructor
 * @param {Hammer} manager
 * @returns {Input}
 */
function createInputInstance(manager) {
    var Type;
    var inputClass = manager.options.inputClass;

    if (inputClass) {
        Type = inputClass;
    } else if (SUPPORT_POINTER_EVENTS) {
        Type = PointerEventInput;
    } else if (SUPPORT_ONLY_TOUCH) {
        Type = TouchInput;
    } else if (!SUPPORT_TOUCH) {
        Type = MouseInput;
    } else {
        Type = TouchMouseInput;
    }
    return new (Type)(manager, inputHandler);
}

/**
 * handle input events
 * @param {Manager} manager
 * @param {String} eventType
 * @param {Object} input
 */
function inputHandler(manager, eventType, input) {
    var pointersLen = input.pointers.length;
    var changedPointersLen = input.changedPointers.length;
    var isFirst = (eventType & INPUT_START && (pointersLen - changedPointersLen === 0));
    var isFinal = (eventType & (INPUT_END | INPUT_CANCEL) && (pointersLen - changedPointersLen === 0));

    input.isFirst = !!isFirst;
    input.isFinal = !!isFinal;

    if (isFirst) {
        manager.session = {};
    }

    // source event is the normalized value of the domEvents
    // like 'touchstart, mouseup, pointerdown'
    input.eventType = eventType;

    // compute scale, rotation etc
    computeInputData(manager, input);

    // emit secret event
    manager.emit('hammer.input', input);

    manager.recognize(input);
    manager.session.prevInput = input;
}

/**
 * extend the data with some usable properties like scale, rotate, velocity etc
 * @param {Object} manager
 * @param {Object} input
 */
function computeInputData(manager, input) {
    var session = manager.session;
    var pointers = input.pointers;
    var pointersLength = pointers.length;

    // store the first input to calculate the distance and direction
    if (!session.firstInput) {
        session.firstInput = simpleCloneInputData(input);
    }

    // to compute scale and rotation we need to store the multiple touches
    if (pointersLength > 1 && !session.firstMultiple) {
        session.firstMultiple = simpleCloneInputData(input);
    } else if (pointersLength === 1) {
        session.firstMultiple = false;
    }

    var firstInput = session.firstInput;
    var firstMultiple = session.firstMultiple;
    var offsetCenter = firstMultiple ? firstMultiple.center : firstInput.center;

    var center = input.center = getCenter(pointers);
    input.timeStamp = now();
    input.deltaTime = input.timeStamp - firstInput.timeStamp;

    input.angle = getAngle(offsetCenter, center);
    input.distance = getDistance(offsetCenter, center);

    computeDeltaXY(session, input);
    input.offsetDirection = getDirection(input.deltaX, input.deltaY);

    var overallVelocity = getVelocity(input.deltaTime, input.deltaX, input.deltaY);
    input.overallVelocityX = overallVelocity.x;
    input.overallVelocityY = overallVelocity.y;
    input.overallVelocity = (abs(overallVelocity.x) > abs(overallVelocity.y)) ? overallVelocity.x : overallVelocity.y;

    input.scale = firstMultiple ? getScale(firstMultiple.pointers, pointers) : 1;
    input.rotation = firstMultiple ? getRotation(firstMultiple.pointers, pointers) : 0;

    input.maxPointers = !session.prevInput ? input.pointers.length : ((input.pointers.length >
        session.prevInput.maxPointers) ? input.pointers.length : session.prevInput.maxPointers);

    computeIntervalInputData(session, input);

    // find the correct target
    var target = manager.element;
    if (hasParent(input.srcEvent.target, target)) {
        target = input.srcEvent.target;
    }
    input.target = target;
}

function computeDeltaXY(session, input) {
    var center = input.center;
    var offset = session.offsetDelta || {};
    var prevDelta = session.prevDelta || {};
    var prevInput = session.prevInput || {};

    if (input.eventType === INPUT_START || prevInput.eventType === INPUT_END) {
        prevDelta = session.prevDelta = {
            x: prevInput.deltaX || 0,
            y: prevInput.deltaY || 0
        };

        offset = session.offsetDelta = {
            x: center.x,
            y: center.y
        };
    }

    input.deltaX = prevDelta.x + (center.x - offset.x);
    input.deltaY = prevDelta.y + (center.y - offset.y);
}

/**
 * velocity is calculated every x ms
 * @param {Object} session
 * @param {Object} input
 */
function computeIntervalInputData(session, input) {
    var last = session.lastInterval || input,
        deltaTime = input.timeStamp - last.timeStamp,
        velocity, velocityX, velocityY, direction;

    if (input.eventType != INPUT_CANCEL && (deltaTime > COMPUTE_INTERVAL || last.velocity === undefined)) {
        var deltaX = input.deltaX - last.deltaX;
        var deltaY = input.deltaY - last.deltaY;

        var v = getVelocity(deltaTime, deltaX, deltaY);
        velocityX = v.x;
        velocityY = v.y;
        velocity = (abs(v.x) > abs(v.y)) ? v.x : v.y;
        direction = getDirection(deltaX, deltaY);

        session.lastInterval = input;
    } else {
        // use latest velocity info if it doesn't overtake a minimum period
        velocity = last.velocity;
        velocityX = last.velocityX;
        velocityY = last.velocityY;
        direction = last.direction;
    }

    input.velocity = velocity;
    input.velocityX = velocityX;
    input.velocityY = velocityY;
    input.direction = direction;
}

/**
 * create a simple clone from the input used for storage of firstInput and firstMultiple
 * @param {Object} input
 * @returns {Object} clonedInputData
 */
function simpleCloneInputData(input) {
    // make a simple copy of the pointers because we will get a reference if we don't
    // we only need clientXY for the calculations
    var pointers = [];
    var i = 0;
    while (i < input.pointers.length) {
        pointers[i] = {
            clientX: round(input.pointers[i].clientX),
            clientY: round(input.pointers[i].clientY)
        };
        i++;
    }

    return {
        timeStamp: now(),
        pointers: pointers,
        center: getCenter(pointers),
        deltaX: input.deltaX,
        deltaY: input.deltaY
    };
}

/**
 * get the center of all the pointers
 * @param {Array} pointers
 * @return {Object} center contains `x` and `y` properties
 */
function getCenter(pointers) {
    var pointersLength = pointers.length;

    // no need to loop when only one touch
    if (pointersLength === 1) {
        return {
            x: round(pointers[0].clientX),
            y: round(pointers[0].clientY)
        };
    }

    var x = 0, y = 0, i = 0;
    while (i < pointersLength) {
        x += pointers[i].clientX;
        y += pointers[i].clientY;
        i++;
    }

    return {
        x: round(x / pointersLength),
        y: round(y / pointersLength)
    };
}

/**
 * calculate the velocity between two points. unit is in px per ms.
 * @param {Number} deltaTime
 * @param {Number} x
 * @param {Number} y
 * @return {Object} velocity `x` and `y`
 */
function getVelocity(deltaTime, x, y) {
    return {
        x: x / deltaTime || 0,
        y: y / deltaTime || 0
    };
}

/**
 * get the direction between two points
 * @param {Number} x
 * @param {Number} y
 * @return {Number} direction
 */
function getDirection(x, y) {
    if (x === y) {
        return DIRECTION_NONE;
    }

    if (abs(x) >= abs(y)) {
        return x < 0 ? DIRECTION_LEFT : DIRECTION_RIGHT;
    }
    return y < 0 ? DIRECTION_UP : DIRECTION_DOWN;
}

/**
 * calculate the absolute distance between two points
 * @param {Object} p1 {x, y}
 * @param {Object} p2 {x, y}
 * @param {Array} [props] containing x and y keys
 * @return {Number} distance
 */
function getDistance(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]],
        y = p2[props[1]] - p1[props[1]];

    return Math.sqrt((x * x) + (y * y));
}

/**
 * calculate the angle between two coordinates
 * @param {Object} p1
 * @param {Object} p2
 * @param {Array} [props] containing x and y keys
 * @return {Number} angle
 */
function getAngle(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]],
        y = p2[props[1]] - p1[props[1]];
    return Math.atan2(y, x) * 180 / Math.PI;
}

/**
 * calculate the rotation degrees between two pointersets
 * @param {Array} start array of pointers
 * @param {Array} end array of pointers
 * @return {Number} rotation
 */
function getRotation(start, end) {
    return getAngle(end[1], end[0], PROPS_CLIENT_XY) + getAngle(start[1], start[0], PROPS_CLIENT_XY);
}

/**
 * calculate the scale factor between two pointersets
 * no scale is 1, and goes down to 0 when pinched together, and bigger when pinched out
 * @param {Array} start array of pointers
 * @param {Array} end array of pointers
 * @return {Number} scale
 */
function getScale(start, end) {
    return getDistance(end[0], end[1], PROPS_CLIENT_XY) / getDistance(start[0], start[1], PROPS_CLIENT_XY);
}

var MOUSE_INPUT_MAP = {
    mousedown: INPUT_START,
    mousemove: INPUT_MOVE,
    mouseup: INPUT_END
};

var MOUSE_ELEMENT_EVENTS = 'mousedown';
var MOUSE_WINDOW_EVENTS = 'mousemove mouseup';

/**
 * Mouse events input
 * @constructor
 * @extends Input
 */
function MouseInput() {
    this.evEl = MOUSE_ELEMENT_EVENTS;
    this.evWin = MOUSE_WINDOW_EVENTS;

    this.allow = true; // used by Input.TouchMouse to disable mouse events
    this.pressed = false; // mousedown state

    Input.apply(this, arguments);
}

inherit(MouseInput, Input, {
    /**
     * handle mouse events
     * @param {Object} ev
     */
    handler: function MEhandler(ev) {
        var eventType = MOUSE_INPUT_MAP[ev.type];

        // on start we want to have the left mouse button down
        if (eventType & INPUT_START && ev.button === 0) {
            this.pressed = true;
        }

        if (eventType & INPUT_MOVE && ev.which !== 1) {
            eventType = INPUT_END;
        }

        // mouse must be down, and mouse events are allowed (see the TouchMouse input)
        if (!this.pressed || !this.allow) {
            return;
        }

        if (eventType & INPUT_END) {
            this.pressed = false;
        }

        this.callback(this.manager, eventType, {
            pointers: [ev],
            changedPointers: [ev],
            pointerType: INPUT_TYPE_MOUSE,
            srcEvent: ev
        });
    }
});

var POINTER_INPUT_MAP = {
    pointerdown: INPUT_START,
    pointermove: INPUT_MOVE,
    pointerup: INPUT_END,
    pointercancel: INPUT_CANCEL,
    pointerout: INPUT_CANCEL
};

// in IE10 the pointer types is defined as an enum
var IE10_POINTER_TYPE_ENUM = {
    2: INPUT_TYPE_TOUCH,
    3: INPUT_TYPE_PEN,
    4: INPUT_TYPE_MOUSE,
    5: INPUT_TYPE_KINECT // see https://twitter.com/jacobrossi/status/480596438489890816
};

var POINTER_ELEMENT_EVENTS = 'pointerdown';
var POINTER_WINDOW_EVENTS = 'pointermove pointerup pointercancel';

// IE10 has prefixed support, and case-sensitive
if (window.MSPointerEvent && !window.PointerEvent) {
    POINTER_ELEMENT_EVENTS = 'MSPointerDown';
    POINTER_WINDOW_EVENTS = 'MSPointerMove MSPointerUp MSPointerCancel';
}

/**
 * Pointer events input
 * @constructor
 * @extends Input
 */
function PointerEventInput() {
    this.evEl = POINTER_ELEMENT_EVENTS;
    this.evWin = POINTER_WINDOW_EVENTS;

    Input.apply(this, arguments);

    this.store = (this.manager.session.pointerEvents = []);
}

inherit(PointerEventInput, Input, {
    /**
     * handle mouse events
     * @param {Object} ev
     */
    handler: function PEhandler(ev) {
        var store = this.store;
        var removePointer = false;

        var eventTypeNormalized = ev.type.toLowerCase().replace('ms', '');
        var eventType = POINTER_INPUT_MAP[eventTypeNormalized];
        var pointerType = IE10_POINTER_TYPE_ENUM[ev.pointerType] || ev.pointerType;

        var isTouch = (pointerType == INPUT_TYPE_TOUCH);

        // get index of the event in the store
        var storeIndex = inArray(store, ev.pointerId, 'pointerId');

        // start and mouse must be down
        if (eventType & INPUT_START && (ev.button === 0 || isTouch)) {
            if (storeIndex < 0) {
                store.push(ev);
                storeIndex = store.length - 1;
            }
        } else if (eventType & (INPUT_END | INPUT_CANCEL)) {
            removePointer = true;
        }

        // it not found, so the pointer hasn't been down (so it's probably a hover)
        if (storeIndex < 0) {
            return;
        }

        // update the event in the store
        store[storeIndex] = ev;

        this.callback(this.manager, eventType, {
            pointers: store,
            changedPointers: [ev],
            pointerType: pointerType,
            srcEvent: ev
        });

        if (removePointer) {
            // remove from the store
            store.splice(storeIndex, 1);
        }
    }
});

var SINGLE_TOUCH_INPUT_MAP = {
    touchstart: INPUT_START,
    touchmove: INPUT_MOVE,
    touchend: INPUT_END,
    touchcancel: INPUT_CANCEL
};

var SINGLE_TOUCH_TARGET_EVENTS = 'touchstart';
var SINGLE_TOUCH_WINDOW_EVENTS = 'touchstart touchmove touchend touchcancel';

/**
 * Touch events input
 * @constructor
 * @extends Input
 */
function SingleTouchInput() {
    this.evTarget = SINGLE_TOUCH_TARGET_EVENTS;
    this.evWin = SINGLE_TOUCH_WINDOW_EVENTS;
    this.started = false;

    Input.apply(this, arguments);
}

inherit(SingleTouchInput, Input, {
    handler: function TEhandler(ev) {
        var type = SINGLE_TOUCH_INPUT_MAP[ev.type];

        // should we handle the touch events?
        if (type === INPUT_START) {
            this.started = true;
        }

        if (!this.started) {
            return;
        }

        var touches = normalizeSingleTouches.call(this, ev, type);

        // when done, reset the started state
        if (type & (INPUT_END | INPUT_CANCEL) && touches[0].length - touches[1].length === 0) {
            this.started = false;
        }

        this.callback(this.manager, type, {
            pointers: touches[0],
            changedPointers: touches[1],
            pointerType: INPUT_TYPE_TOUCH,
            srcEvent: ev
        });
    }
});

/**
 * @this {TouchInput}
 * @param {Object} ev
 * @param {Number} type flag
 * @returns {undefined|Array} [all, changed]
 */
function normalizeSingleTouches(ev, type) {
    var all = toArray(ev.touches);
    var changed = toArray(ev.changedTouches);

    if (type & (INPUT_END | INPUT_CANCEL)) {
        all = uniqueArray(all.concat(changed), 'identifier', true);
    }

    return [all, changed];
}

var TOUCH_INPUT_MAP = {
    touchstart: INPUT_START,
    touchmove: INPUT_MOVE,
    touchend: INPUT_END,
    touchcancel: INPUT_CANCEL
};

var TOUCH_TARGET_EVENTS = 'touchstart touchmove touchend touchcancel';

/**
 * Multi-user touch events input
 * @constructor
 * @extends Input
 */
function TouchInput() {
    this.evTarget = TOUCH_TARGET_EVENTS;
    this.targetIds = {};

    Input.apply(this, arguments);
}

inherit(TouchInput, Input, {
    handler: function MTEhandler(ev) {
        var type = TOUCH_INPUT_MAP[ev.type];
        var touches = getTouches.call(this, ev, type);
        if (!touches) {
            return;
        }

        this.callback(this.manager, type, {
            pointers: touches[0],
            changedPointers: touches[1],
            pointerType: INPUT_TYPE_TOUCH,
            srcEvent: ev
        });
    }
});

/**
 * @this {TouchInput}
 * @param {Object} ev
 * @param {Number} type flag
 * @returns {undefined|Array} [all, changed]
 */
function getTouches(ev, type) {
    var allTouches = toArray(ev.touches);
    var targetIds = this.targetIds;

    // when there is only one touch, the process can be simplified
    if (type & (INPUT_START | INPUT_MOVE) && allTouches.length === 1) {
        targetIds[allTouches[0].identifier] = true;
        return [allTouches, allTouches];
    }

    var i,
        targetTouches,
        changedTouches = toArray(ev.changedTouches),
        changedTargetTouches = [],
        target = this.target;

    // get target touches from touches
    targetTouches = allTouches.filter(function(touch) {
        return hasParent(touch.target, target);
    });

    // collect touches
    if (type === INPUT_START) {
        i = 0;
        while (i < targetTouches.length) {
            targetIds[targetTouches[i].identifier] = true;
            i++;
        }
    }

    // filter changed touches to only contain touches that exist in the collected target ids
    i = 0;
    while (i < changedTouches.length) {
        if (targetIds[changedTouches[i].identifier]) {
            changedTargetTouches.push(changedTouches[i]);
        }

        // cleanup removed touches
        if (type & (INPUT_END | INPUT_CANCEL)) {
            delete targetIds[changedTouches[i].identifier];
        }
        i++;
    }

    if (!changedTargetTouches.length) {
        return;
    }

    return [
        // merge targetTouches with changedTargetTouches so it contains ALL touches, including 'end' and 'cancel'
        uniqueArray(targetTouches.concat(changedTargetTouches), 'identifier', true),
        changedTargetTouches
    ];
}

/**
 * Combined touch and mouse input
 *
 * Touch has a higher priority then mouse, and while touching no mouse events are allowed.
 * This because touch devices also emit mouse events while doing a touch.
 *
 * @constructor
 * @extends Input
 */
function TouchMouseInput() {
    Input.apply(this, arguments);

    var handler = bindFn(this.handler, this);
    this.touch = new TouchInput(this.manager, handler);
    this.mouse = new MouseInput(this.manager, handler);
}

inherit(TouchMouseInput, Input, {
    /**
     * handle mouse and touch events
     * @param {Hammer} manager
     * @param {String} inputEvent
     * @param {Object} inputData
     */
    handler: function TMEhandler(manager, inputEvent, inputData) {
        var isTouch = (inputData.pointerType == INPUT_TYPE_TOUCH),
            isMouse = (inputData.pointerType == INPUT_TYPE_MOUSE);

        // when we're in a touch event, so  block all upcoming mouse events
        // most mobile browser also emit mouseevents, right after touchstart
        if (isTouch) {
            this.mouse.allow = false;
        } else if (isMouse && !this.mouse.allow) {
            return;
        }

        // reset the allowMouse when we're done
        if (inputEvent & (INPUT_END | INPUT_CANCEL)) {
            this.mouse.allow = true;
        }

        this.callback(manager, inputEvent, inputData);
    },

    /**
     * remove the event listeners
     */
    destroy: function destroy() {
        this.touch.destroy();
        this.mouse.destroy();
    }
});

var PREFIXED_TOUCH_ACTION = prefixed(TEST_ELEMENT.style, 'touchAction');
var NATIVE_TOUCH_ACTION = PREFIXED_TOUCH_ACTION !== undefined;

// magical touchAction value
var TOUCH_ACTION_COMPUTE = 'compute';
var TOUCH_ACTION_AUTO = 'auto';
var TOUCH_ACTION_MANIPULATION = 'manipulation'; // not implemented
var TOUCH_ACTION_NONE = 'none';
var TOUCH_ACTION_PAN_X = 'pan-x';
var TOUCH_ACTION_PAN_Y = 'pan-y';

/**
 * Touch Action
 * sets the touchAction property or uses the js alternative
 * @param {Manager} manager
 * @param {String} value
 * @constructor
 */
function TouchAction(manager, value) {
    this.manager = manager;
    this.set(value);
}

TouchAction.prototype = {
    /**
     * set the touchAction value on the element or enable the polyfill
     * @param {String} value
     */
    set: function(value) {
        // find out the touch-action by the event handlers
        if (value == TOUCH_ACTION_COMPUTE) {
            value = this.compute();
        }

        if (NATIVE_TOUCH_ACTION && this.manager.element.style) {
            this.manager.element.style[PREFIXED_TOUCH_ACTION] = value;
        }
        this.actions = value.toLowerCase().trim();
    },

    /**
     * just re-set the touchAction value
     */
    update: function() {
        this.set(this.manager.options.touchAction);
    },

    /**
     * compute the value for the touchAction property based on the recognizer's settings
     * @returns {String} value
     */
    compute: function() {
        var actions = [];
        each(this.manager.recognizers, function(recognizer) {
            if (boolOrFn(recognizer.options.enable, [recognizer])) {
                actions = actions.concat(recognizer.getTouchAction());
            }
        });
        return cleanTouchActions(actions.join(' '));
    },

    /**
     * this method is called on each input cycle and provides the preventing of the browser behavior
     * @param {Object} input
     */
    preventDefaults: function(input) {
        // not needed with native support for the touchAction property
        if (NATIVE_TOUCH_ACTION) {
            return;
        }

        var srcEvent = input.srcEvent;
        var direction = input.offsetDirection;

        // if the touch action did prevented once this session
        if (this.manager.session.prevented) {
            srcEvent.preventDefault();
            return;
        }

        var actions = this.actions;
        var hasNone = inStr(actions, TOUCH_ACTION_NONE);
        var hasPanY = inStr(actions, TOUCH_ACTION_PAN_Y);
        var hasPanX = inStr(actions, TOUCH_ACTION_PAN_X);

        if (hasNone) {
            //do not prevent defaults if this is a tap gesture

            var isTapPointer = input.pointers.length === 1;
            var isTapMovement = input.distance < 2;
            var isTapTouchTime = input.deltaTime < 250;

            if (isTapPointer && isTapMovement && isTapTouchTime) {
                return;
            }
        }

        if (hasPanX && hasPanY) {
            // `pan-x pan-y` means browser handles all scrolling/panning, do not prevent
            return;
        }

        if (hasNone ||
            (hasPanY && direction & DIRECTION_HORIZONTAL) ||
            (hasPanX && direction & DIRECTION_VERTICAL)) {
            return this.preventSrc(srcEvent);
        }
    },

    /**
     * call preventDefault to prevent the browser's default behavior (scrolling in most cases)
     * @param {Object} srcEvent
     */
    preventSrc: function(srcEvent) {
        this.manager.session.prevented = true;
        srcEvent.preventDefault();
    }
};

/**
 * when the touchActions are collected they are not a valid value, so we need to clean things up. *
 * @param {String} actions
 * @returns {*}
 */
function cleanTouchActions(actions) {
    // none
    if (inStr(actions, TOUCH_ACTION_NONE)) {
        return TOUCH_ACTION_NONE;
    }

    var hasPanX = inStr(actions, TOUCH_ACTION_PAN_X);
    var hasPanY = inStr(actions, TOUCH_ACTION_PAN_Y);

    // if both pan-x and pan-y are set (different recognizers
    // for different directions, e.g. horizontal pan but vertical swipe?)
    // we need none (as otherwise with pan-x pan-y combined none of these
    // recognizers will work, since the browser would handle all panning
    if (hasPanX && hasPanY) {
        return TOUCH_ACTION_NONE;
    }

    // pan-x OR pan-y
    if (hasPanX || hasPanY) {
        return hasPanX ? TOUCH_ACTION_PAN_X : TOUCH_ACTION_PAN_Y;
    }

    // manipulation
    if (inStr(actions, TOUCH_ACTION_MANIPULATION)) {
        return TOUCH_ACTION_MANIPULATION;
    }

    return TOUCH_ACTION_AUTO;
}

/**
 * Recognizer flow explained; *
 * All recognizers have the initial state of POSSIBLE when a input session starts.
 * The definition of a input session is from the first input until the last input, with all it's movement in it. *
 * Example session for mouse-input: mousedown -> mousemove -> mouseup
 *
 * On each recognizing cycle (see Manager.recognize) the .recognize() method is executed
 * which determines with state it should be.
 *
 * If the recognizer has the state FAILED, CANCELLED or RECOGNIZED (equals ENDED), it is reset to
 * POSSIBLE to give it another change on the next cycle.
 *
 *               Possible
 *                  |
 *            +-----+---------------+
 *            |                     |
 *      +-----+-----+               |
 *      |           |               |
 *   Failed      Cancelled          |
 *                          +-------+------+
 *                          |              |
 *                      Recognized       Began
 *                                         |
 *                                      Changed
 *                                         |
 *                                  Ended/Recognized
 */
var STATE_POSSIBLE = 1;
var STATE_BEGAN = 2;
var STATE_CHANGED = 4;
var STATE_ENDED = 8;
var STATE_RECOGNIZED = STATE_ENDED;
var STATE_CANCELLED = 16;
var STATE_FAILED = 32;

/**
 * Recognizer
 * Every recognizer needs to extend from this class.
 * @constructor
 * @param {Object} options
 */
function Recognizer(options) {
    this.options = assign({}, this.defaults, options || {});

    this.id = uniqueId();

    this.manager = null;

    // default is enable true
    this.options.enable = ifUndefined(this.options.enable, true);

    this.state = STATE_POSSIBLE;

    this.simultaneous = {};
    this.requireFail = [];
}

Recognizer.prototype = {
    /**
     * @virtual
     * @type {Object}
     */
    defaults: {},

    /**
     * set options
     * @param {Object} options
     * @return {Recognizer}
     */
    set: function(options) {
        assign(this.options, options);

        // also update the touchAction, in case something changed about the directions/enabled state
        this.manager && this.manager.touchAction.update();
        return this;
    },

    /**
     * recognize simultaneous with an other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    recognizeWith: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'recognizeWith', this)) {
            return this;
        }

        var simultaneous = this.simultaneous;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        if (!simultaneous[otherRecognizer.id]) {
            simultaneous[otherRecognizer.id] = otherRecognizer;
            otherRecognizer.recognizeWith(this);
        }
        return this;
    },

    /**
     * drop the simultaneous link. it doesnt remove the link on the other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    dropRecognizeWith: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'dropRecognizeWith', this)) {
            return this;
        }

        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        delete this.simultaneous[otherRecognizer.id];
        return this;
    },

    /**
     * recognizer can only run when an other is failing
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    requireFailure: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'requireFailure', this)) {
            return this;
        }

        var requireFail = this.requireFail;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        if (inArray(requireFail, otherRecognizer) === -1) {
            requireFail.push(otherRecognizer);
            otherRecognizer.requireFailure(this);
        }
        return this;
    },

    /**
     * drop the requireFailure link. it does not remove the link on the other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    dropRequireFailure: function(otherRecognizer) {
        if (invokeArrayArg(otherRecognizer, 'dropRequireFailure', this)) {
            return this;
        }

        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this);
        var index = inArray(this.requireFail, otherRecognizer);
        if (index > -1) {
            this.requireFail.splice(index, 1);
        }
        return this;
    },

    /**
     * has require failures boolean
     * @returns {boolean}
     */
    hasRequireFailures: function() {
        return this.requireFail.length > 0;
    },

    /**
     * if the recognizer can recognize simultaneous with an other recognizer
     * @param {Recognizer} otherRecognizer
     * @returns {Boolean}
     */
    canRecognizeWith: function(otherRecognizer) {
        return !!this.simultaneous[otherRecognizer.id];
    },

    /**
     * You should use `tryEmit` instead of `emit` directly to check
     * that all the needed recognizers has failed before emitting.
     * @param {Object} input
     */
    emit: function(input) {
        var self = this;
        var state = this.state;

        function emit(event) {
            self.manager.emit(event, input);
        }

        // 'panstart' and 'panmove'
        if (state < STATE_ENDED) {
            emit(self.options.event + stateStr(state));
        }

        emit(self.options.event); // simple 'eventName' events

        if (input.additionalEvent) { // additional event(panleft, panright, pinchin, pinchout...)
            emit(input.additionalEvent);
        }

        // panend and pancancel
        if (state >= STATE_ENDED) {
            emit(self.options.event + stateStr(state));
        }
    },

    /**
     * Check that all the require failure recognizers has failed,
     * if true, it emits a gesture event,
     * otherwise, setup the state to FAILED.
     * @param {Object} input
     */
    tryEmit: function(input) {
        if (this.canEmit()) {
            return this.emit(input);
        }
        // it's failing anyway
        this.state = STATE_FAILED;
    },

    /**
     * can we emit?
     * @returns {boolean}
     */
    canEmit: function() {
        var i = 0;
        while (i < this.requireFail.length) {
            if (!(this.requireFail[i].state & (STATE_FAILED | STATE_POSSIBLE))) {
                return false;
            }
            i++;
        }
        return true;
    },

    /**
     * update the recognizer
     * @param {Object} inputData
     */
    recognize: function(inputData) {
        // make a new copy of the inputData
        // so we can change the inputData without messing up the other recognizers
        var inputDataClone = assign({}, inputData);

        // is is enabled and allow recognizing?
        if (!boolOrFn(this.options.enable, [this, inputDataClone])) {
            this.reset();
            this.state = STATE_FAILED;
            return;
        }

        // reset when we've reached the end
        if (this.state & (STATE_RECOGNIZED | STATE_CANCELLED | STATE_FAILED)) {
            this.state = STATE_POSSIBLE;
        }

        this.state = this.process(inputDataClone);

        // the recognizer has recognized a gesture
        // so trigger an event
        if (this.state & (STATE_BEGAN | STATE_CHANGED | STATE_ENDED | STATE_CANCELLED)) {
            this.tryEmit(inputDataClone);
        }
    },

    /**
     * return the state of the recognizer
     * the actual recognizing happens in this method
     * @virtual
     * @param {Object} inputData
     * @returns {Const} STATE
     */
    process: function(inputData) { }, // jshint ignore:line

    /**
     * return the preferred touch-action
     * @virtual
     * @returns {Array}
     */
    getTouchAction: function() { },

    /**
     * called when the gesture isn't allowed to recognize
     * like when another is being recognized or it is disabled
     * @virtual
     */
    reset: function() { }
};

/**
 * get a usable string, used as event postfix
 * @param {Const} state
 * @returns {String} state
 */
function stateStr(state) {
    if (state & STATE_CANCELLED) {
        return 'cancel';
    } else if (state & STATE_ENDED) {
        return 'end';
    } else if (state & STATE_CHANGED) {
        return 'move';
    } else if (state & STATE_BEGAN) {
        return 'start';
    }
    return '';
}

/**
 * direction cons to string
 * @param {Const} direction
 * @returns {String}
 */
function directionStr(direction) {
    if (direction == DIRECTION_DOWN) {
        return 'down';
    } else if (direction == DIRECTION_UP) {
        return 'up';
    } else if (direction == DIRECTION_LEFT) {
        return 'left';
    } else if (direction == DIRECTION_RIGHT) {
        return 'right';
    }
    return '';
}

/**
 * get a recognizer by name if it is bound to a manager
 * @param {Recognizer|String} otherRecognizer
 * @param {Recognizer} recognizer
 * @returns {Recognizer}
 */
function getRecognizerByNameIfManager(otherRecognizer, recognizer) {
    var manager = recognizer.manager;
    if (manager) {
        return manager.get(otherRecognizer);
    }
    return otherRecognizer;
}

/**
 * This recognizer is just used as a base for the simple attribute recognizers.
 * @constructor
 * @extends Recognizer
 */
function AttrRecognizer() {
    Recognizer.apply(this, arguments);
}

inherit(AttrRecognizer, Recognizer, {
    /**
     * @namespace
     * @memberof AttrRecognizer
     */
    defaults: {
        /**
         * @type {Number}
         * @default 1
         */
        pointers: 1
    },

    /**
     * Used to check if it the recognizer receives valid input, like input.distance > 10.
     * @memberof AttrRecognizer
     * @param {Object} input
     * @returns {Boolean} recognized
     */
    attrTest: function(input) {
        var optionPointers = this.options.pointers;
        return optionPointers === 0 || input.pointers.length === optionPointers;
    },

    /**
     * Process the input and return the state for the recognizer
     * @memberof AttrRecognizer
     * @param {Object} input
     * @returns {*} State
     */
    process: function(input) {
        var state = this.state;
        var eventType = input.eventType;

        var isRecognized = state & (STATE_BEGAN | STATE_CHANGED);
        var isValid = this.attrTest(input);

        // on cancel input and we've recognized before, return STATE_CANCELLED
        if (isRecognized && (eventType & INPUT_CANCEL || !isValid)) {
            return state | STATE_CANCELLED;
        } else if (isRecognized || isValid) {
            if (eventType & INPUT_END) {
                return state | STATE_ENDED;
            } else if (!(state & STATE_BEGAN)) {
                return STATE_BEGAN;
            }
            return state | STATE_CHANGED;
        }
        return STATE_FAILED;
    }
});

/**
 * Pan
 * Recognized when the pointer is down and moved in the allowed direction.
 * @constructor
 * @extends AttrRecognizer
 */
function PanRecognizer() {
    AttrRecognizer.apply(this, arguments);

    this.pX = null;
    this.pY = null;
}

inherit(PanRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof PanRecognizer
     */
    defaults: {
        event: 'pan',
        threshold: 10,
        pointers: 1,
        direction: DIRECTION_ALL
    },

    getTouchAction: function() {
        var direction = this.options.direction;
        var actions = [];
        if (direction & DIRECTION_HORIZONTAL) {
            actions.push(TOUCH_ACTION_PAN_Y);
        }
        if (direction & DIRECTION_VERTICAL) {
            actions.push(TOUCH_ACTION_PAN_X);
        }
        return actions;
    },

    directionTest: function(input) {
        var options = this.options;
        var hasMoved = true;
        var distance = input.distance;
        var direction = input.direction;
        var x = input.deltaX;
        var y = input.deltaY;

        // lock to axis?
        if (!(direction & options.direction)) {
            if (options.direction & DIRECTION_HORIZONTAL) {
                direction = (x === 0) ? DIRECTION_NONE : (x < 0) ? DIRECTION_LEFT : DIRECTION_RIGHT;
                hasMoved = x != this.pX;
                distance = Math.abs(input.deltaX);
            } else {
                direction = (y === 0) ? DIRECTION_NONE : (y < 0) ? DIRECTION_UP : DIRECTION_DOWN;
                hasMoved = y != this.pY;
                distance = Math.abs(input.deltaY);
            }
        }
        input.direction = direction;
        return hasMoved && distance > options.threshold && direction & options.direction;
    },

    attrTest: function(input) {
        return AttrRecognizer.prototype.attrTest.call(this, input) &&
            (this.state & STATE_BEGAN || (!(this.state & STATE_BEGAN) && this.directionTest(input)));
    },

    emit: function(input) {

        this.pX = input.deltaX;
        this.pY = input.deltaY;

        var direction = directionStr(input.direction);

        if (direction) {
            input.additionalEvent = this.options.event + direction;
        }
        this._super.emit.call(this, input);
    }
});

/**
 * Pinch
 * Recognized when two or more pointers are moving toward (zoom-in) or away from each other (zoom-out).
 * @constructor
 * @extends AttrRecognizer
 */
function PinchRecognizer() {
    AttrRecognizer.apply(this, arguments);
}

inherit(PinchRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof PinchRecognizer
     */
    defaults: {
        event: 'pinch',
        threshold: 0,
        pointers: 2
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_NONE];
    },

    attrTest: function(input) {
        return this._super.attrTest.call(this, input) &&
            (Math.abs(input.scale - 1) > this.options.threshold || this.state & STATE_BEGAN);
    },

    emit: function(input) {
        if (input.scale !== 1) {
            var inOut = input.scale < 1 ? 'in' : 'out';
            input.additionalEvent = this.options.event + inOut;
        }
        this._super.emit.call(this, input);
    }
});

/**
 * Press
 * Recognized when the pointer is down for x ms without any movement.
 * @constructor
 * @extends Recognizer
 */
function PressRecognizer() {
    Recognizer.apply(this, arguments);

    this._timer = null;
    this._input = null;
}

inherit(PressRecognizer, Recognizer, {
    /**
     * @namespace
     * @memberof PressRecognizer
     */
    defaults: {
        event: 'press',
        pointers: 1,
        time: 251, // minimal time of the pointer to be pressed
        threshold: 9 // a minimal movement is ok, but keep it low
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_AUTO];
    },

    process: function(input) {
        var options = this.options;
        var validPointers = input.pointers.length === options.pointers;
        var validMovement = input.distance < options.threshold;
        var validTime = input.deltaTime > options.time;

        this._input = input;

        // we only allow little movement
        // and we've reached an end event, so a tap is possible
        if (!validMovement || !validPointers || (input.eventType & (INPUT_END | INPUT_CANCEL) && !validTime)) {
            this.reset();
        } else if (input.eventType & INPUT_START) {
            this.reset();
            this._timer = setTimeoutContext(function() {
                this.state = STATE_RECOGNIZED;
                this.tryEmit();
            }, options.time, this);
        } else if (input.eventType & INPUT_END) {
            return STATE_RECOGNIZED;
        }
        return STATE_FAILED;
    },

    reset: function() {
        clearTimeout(this._timer);
    },

    emit: function(input) {
        if (this.state !== STATE_RECOGNIZED) {
            return;
        }

        if (input && (input.eventType & INPUT_END)) {
            this.manager.emit(this.options.event + 'up', input);
        } else {
            this._input.timeStamp = now();
            this.manager.emit(this.options.event, this._input);
        }
    }
});

/**
 * Rotate
 * Recognized when two or more pointer are moving in a circular motion.
 * @constructor
 * @extends AttrRecognizer
 */
function RotateRecognizer() {
    AttrRecognizer.apply(this, arguments);
}

inherit(RotateRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof RotateRecognizer
     */
    defaults: {
        event: 'rotate',
        threshold: 0,
        pointers: 2
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_NONE];
    },

    attrTest: function(input) {
        return this._super.attrTest.call(this, input) &&
            (Math.abs(input.rotation) > this.options.threshold || this.state & STATE_BEGAN);
    }
});

/**
 * Swipe
 * Recognized when the pointer is moving fast (velocity), with enough distance in the allowed direction.
 * @constructor
 * @extends AttrRecognizer
 */
function SwipeRecognizer() {
    AttrRecognizer.apply(this, arguments);
}

inherit(SwipeRecognizer, AttrRecognizer, {
    /**
     * @namespace
     * @memberof SwipeRecognizer
     */
    defaults: {
        event: 'swipe',
        threshold: 10,
        velocity: 0.3,
        direction: DIRECTION_HORIZONTAL | DIRECTION_VERTICAL,
        pointers: 1
    },

    getTouchAction: function() {
        return PanRecognizer.prototype.getTouchAction.call(this);
    },

    attrTest: function(input) {
        var direction = this.options.direction;
        var velocity;

        if (direction & (DIRECTION_HORIZONTAL | DIRECTION_VERTICAL)) {
            velocity = input.overallVelocity;
        } else if (direction & DIRECTION_HORIZONTAL) {
            velocity = input.overallVelocityX;
        } else if (direction & DIRECTION_VERTICAL) {
            velocity = input.overallVelocityY;
        }

        return this._super.attrTest.call(this, input) &&
            direction & input.offsetDirection &&
            input.distance > this.options.threshold &&
            input.maxPointers == this.options.pointers &&
            abs(velocity) > this.options.velocity && input.eventType & INPUT_END;
    },

    emit: function(input) {
        var direction = directionStr(input.offsetDirection);
        if (direction) {
            this.manager.emit(this.options.event + direction, input);
        }

        this.manager.emit(this.options.event, input);
    }
});

/**
 * A tap is ecognized when the pointer is doing a small tap/click. Multiple taps are recognized if they occur
 * between the given interval and position. The delay option can be used to recognize multi-taps without firing
 * a single tap.
 *
 * The eventData from the emitted event contains the property `tapCount`, which contains the amount of
 * multi-taps being recognized.
 * @constructor
 * @extends Recognizer
 */
function TapRecognizer() {
    Recognizer.apply(this, arguments);

    // previous time and center,
    // used for tap counting
    this.pTime = false;
    this.pCenter = false;

    this._timer = null;
    this._input = null;
    this.count = 0;
}

inherit(TapRecognizer, Recognizer, {
    /**
     * @namespace
     * @memberof PinchRecognizer
     */
    defaults: {
        event: 'tap',
        pointers: 1,
        taps: 1,
        interval: 300, // max time between the multi-tap taps
        time: 250, // max time of the pointer to be down (like finger on the screen)
        threshold: 9, // a minimal movement is ok, but keep it low
        posThreshold: 10 // a multi-tap can be a bit off the initial position
    },

    getTouchAction: function() {
        return [TOUCH_ACTION_MANIPULATION];
    },

    process: function(input) {
        var options = this.options;

        var validPointers = input.pointers.length === options.pointers;
        var validMovement = input.distance < options.threshold;
        var validTouchTime = input.deltaTime < options.time;

        this.reset();

        if ((input.eventType & INPUT_START) && (this.count === 0)) {
            return this.failTimeout();
        }

        // we only allow little movement
        // and we've reached an end event, so a tap is possible
        if (validMovement && validTouchTime && validPointers) {
            if (input.eventType != INPUT_END) {
                return this.failTimeout();
            }

            var validInterval = this.pTime ? (input.timeStamp - this.pTime < options.interval) : true;
            var validMultiTap = !this.pCenter || getDistance(this.pCenter, input.center) < options.posThreshold;

            this.pTime = input.timeStamp;
            this.pCenter = input.center;

            if (!validMultiTap || !validInterval) {
                this.count = 1;
            } else {
                this.count += 1;
            }

            this._input = input;

            // if tap count matches we have recognized it,
            // else it has began recognizing...
            var tapCount = this.count % options.taps;
            if (tapCount === 0) {
                // no failing requirements, immediately trigger the tap event
                // or wait as long as the multitap interval to trigger
                if (!this.hasRequireFailures()) {
                    return STATE_RECOGNIZED;
                } else {
                    this._timer = setTimeoutContext(function() {
                        this.state = STATE_RECOGNIZED;
                        this.tryEmit();
                    }, options.interval, this);
                    return STATE_BEGAN;
                }
            }
        }
        return STATE_FAILED;
    },

    failTimeout: function() {
        this._timer = setTimeoutContext(function() {
            this.state = STATE_FAILED;
        }, this.options.interval, this);
        return STATE_FAILED;
    },

    reset: function() {
        clearTimeout(this._timer);
    },

    emit: function() {
        if (this.state == STATE_RECOGNIZED) {
            this._input.tapCount = this.count;
            this.manager.emit(this.options.event, this._input);
        }
    }
});

/**
 * Simple way to create a manager with a default set of recognizers.
 * @param {HTMLElement} element
 * @param {Object} [options]
 * @constructor
 */
function Hammer(element, options) {
    options = options || {};
    options.recognizers = ifUndefined(options.recognizers, Hammer.defaults.preset);
    return new Manager(element, options);
}

/**
 * @const {string}
 */
Hammer.VERSION = '2.0.6';

/**
 * default settings
 * @namespace
 */
Hammer.defaults = {
    /**
     * set if DOM events are being triggered.
     * But this is slower and unused by simple implementations, so disabled by default.
     * @type {Boolean}
     * @default false
     */
    domEvents: false,

    /**
     * The value for the touchAction property/fallback.
     * When set to `compute` it will magically set the correct value based on the added recognizers.
     * @type {String}
     * @default compute
     */
    touchAction: TOUCH_ACTION_COMPUTE,

    /**
     * @type {Boolean}
     * @default true
     */
    enable: true,

    /**
     * EXPERIMENTAL FEATURE -- can be removed/changed
     * Change the parent input target element.
     * If Null, then it is being set the to main element.
     * @type {Null|EventTarget}
     * @default null
     */
    inputTarget: null,

    /**
     * force an input class
     * @type {Null|Function}
     * @default null
     */
    inputClass: null,

    /**
     * Default recognizer setup when calling `Hammer()`
     * When creating a new Manager these will be skipped.
     * @type {Array}
     */
    preset: [
        // RecognizerClass, options, [recognizeWith, ...], [requireFailure, ...]
        [RotateRecognizer, {enable: false}],
        [PinchRecognizer, {enable: false}, ['rotate']],
        [SwipeRecognizer, {direction: DIRECTION_HORIZONTAL}],
        [PanRecognizer, {direction: DIRECTION_HORIZONTAL}, ['swipe']],
        [TapRecognizer],
        [TapRecognizer, {event: 'doubletap', taps: 2}, ['tap']],
        [PressRecognizer]
    ],

    /**
     * Some CSS properties can be used to improve the working of Hammer.
     * Add them to this method and they will be set when creating a new Manager.
     * @namespace
     */
    cssProps: {
        /**
         * Disables text selection to improve the dragging gesture. Mainly for desktop browsers.
         * @type {String}
         * @default 'none'
         */
        userSelect: 'none',

        /**
         * Disable the Windows Phone grippers when pressing an element.
         * @type {String}
         * @default 'none'
         */
        touchSelect: 'none',

        /**
         * Disables the default callout shown when you touch and hold a touch target.
         * On iOS, when you touch and hold a touch target such as a link, Safari displays
         * a callout containing information about the link. This property allows you to disable that callout.
         * @type {String}
         * @default 'none'
         */
        touchCallout: 'none',

        /**
         * Specifies whether zooming is enabled. Used by IE10>
         * @type {String}
         * @default 'none'
         */
        contentZooming: 'none',

        /**
         * Specifies that an entire element should be draggable instead of its contents. Mainly for desktop browsers.
         * @type {String}
         * @default 'none'
         */
        userDrag: 'none',

        /**
         * Overrides the highlight color shown when the user taps a link or a JavaScript
         * clickable element in iOS. This property obeys the alpha value, if specified.
         * @type {String}
         * @default 'rgba(0,0,0,0)'
         */
        tapHighlightColor: 'rgba(0,0,0,0)'
    }
};

var STOP = 1;
var FORCED_STOP = 2;

/**
 * Manager
 * @param {HTMLElement} element
 * @param {Object} [options]
 * @constructor
 */
function Manager(element, options) {
    this.options = assign({}, Hammer.defaults, options || {});

    this.options.inputTarget = this.options.inputTarget || element;

    this.handlers = {};
    this.session = {};
    this.recognizers = [];

    this.element = element;
    this.input = createInputInstance(this);
    this.touchAction = new TouchAction(this, this.options.touchAction);

    toggleCssProps(this, true);

    each(this.options.recognizers, function(item) {
        var recognizer = this.add(new (item[0])(item[1]));
        item[2] && recognizer.recognizeWith(item[2]);
        item[3] && recognizer.requireFailure(item[3]);
    }, this);
}

Manager.prototype = {
    /**
     * set options
     * @param {Object} options
     * @returns {Manager}
     */
    set: function(options) {
        assign(this.options, options);

        // Options that need a little more setup
        if (options.touchAction) {
            this.touchAction.update();
        }
        if (options.inputTarget) {
            // Clean up existing event listeners and reinitialize
            this.input.destroy();
            this.input.target = options.inputTarget;
            this.input.init();
        }
        return this;
    },

    /**
     * stop recognizing for this session.
     * This session will be discarded, when a new [input]start event is fired.
     * When forced, the recognizer cycle is stopped immediately.
     * @param {Boolean} [force]
     */
    stop: function(force) {
        this.session.stopped = force ? FORCED_STOP : STOP;
    },

    /**
     * run the recognizers!
     * called by the inputHandler function on every movement of the pointers (touches)
     * it walks through all the recognizers and tries to detect the gesture that is being made
     * @param {Object} inputData
     */
    recognize: function(inputData) {
        var session = this.session;
        if (session.stopped) {
            return;
        }

        // run the touch-action polyfill
        this.touchAction.preventDefaults(inputData);

        var recognizer;
        var recognizers = this.recognizers;

        // this holds the recognizer that is being recognized.
        // so the recognizer's state needs to be BEGAN, CHANGED, ENDED or RECOGNIZED
        // if no recognizer is detecting a thing, it is set to `null`
        var curRecognizer = session.curRecognizer;

        // reset when the last recognizer is recognized
        // or when we're in a new session
        if (!curRecognizer || (curRecognizer && curRecognizer.state & STATE_RECOGNIZED)) {
            curRecognizer = session.curRecognizer = null;
        }

        var i = 0;
        while (i < recognizers.length) {
            recognizer = recognizers[i];

            // find out if we are allowed try to recognize the input for this one.
            // 1.   allow if the session is NOT forced stopped (see the .stop() method)
            // 2.   allow if we still haven't recognized a gesture in this session, or the this recognizer is the one
            //      that is being recognized.
            // 3.   allow if the recognizer is allowed to run simultaneous with the current recognized recognizer.
            //      this can be setup with the `recognizeWith()` method on the recognizer.
            if (session.stopped !== FORCED_STOP && ( // 1
                    !curRecognizer || recognizer == curRecognizer || // 2
                    recognizer.canRecognizeWith(curRecognizer))) { // 3
                recognizer.recognize(inputData);
            } else {
                recognizer.reset();
            }

            // if the recognizer has been recognizing the input as a valid gesture, we want to store this one as the
            // current active recognizer. but only if we don't already have an active recognizer
            if (!curRecognizer && recognizer.state & (STATE_BEGAN | STATE_CHANGED | STATE_ENDED)) {
                curRecognizer = session.curRecognizer = recognizer;
            }
            i++;
        }
    },

    /**
     * get a recognizer by its event name.
     * @param {Recognizer|String} recognizer
     * @returns {Recognizer|Null}
     */
    get: function(recognizer) {
        if (recognizer instanceof Recognizer) {
            return recognizer;
        }

        var recognizers = this.recognizers;
        for (var i = 0; i < recognizers.length; i++) {
            if (recognizers[i].options.event == recognizer) {
                return recognizers[i];
            }
        }
        return null;
    },

    /**
     * add a recognizer to the manager
     * existing recognizers with the same event name will be removed
     * @param {Recognizer} recognizer
     * @returns {Recognizer|Manager}
     */
    add: function(recognizer) {
        if (invokeArrayArg(recognizer, 'add', this)) {
            return this;
        }

        // remove existing
        var existing = this.get(recognizer.options.event);
        if (existing) {
            this.remove(existing);
        }

        this.recognizers.push(recognizer);
        recognizer.manager = this;

        this.touchAction.update();
        return recognizer;
    },

    /**
     * remove a recognizer by name or instance
     * @param {Recognizer|String} recognizer
     * @returns {Manager}
     */
    remove: function(recognizer) {
        if (invokeArrayArg(recognizer, 'remove', this)) {
            return this;
        }

        recognizer = this.get(recognizer);

        // let's make sure this recognizer exists
        if (recognizer) {
            var recognizers = this.recognizers;
            var index = inArray(recognizers, recognizer);

            if (index !== -1) {
                recognizers.splice(index, 1);
                this.touchAction.update();
            }
        }

        return this;
    },

    /**
     * bind event
     * @param {String} events
     * @param {Function} handler
     * @returns {EventEmitter} this
     */
    on: function(events, handler) {
        var handlers = this.handlers;
        each(splitStr(events), function(event) {
            handlers[event] = handlers[event] || [];
            handlers[event].push(handler);
        });
        return this;
    },

    /**
     * unbind event, leave emit blank to remove all handlers
     * @param {String} events
     * @param {Function} [handler]
     * @returns {EventEmitter} this
     */
    off: function(events, handler) {
        var handlers = this.handlers;
        each(splitStr(events), function(event) {
            if (!handler) {
                delete handlers[event];
            } else {
                handlers[event] && handlers[event].splice(inArray(handlers[event], handler), 1);
            }
        });
        return this;
    },

    /**
     * emit event to the listeners
     * @param {String} event
     * @param {Object} data
     */
    emit: function(event, data) {
        // we also want to trigger dom events
        if (this.options.domEvents) {
            triggerDomEvent(event, data);
        }

        // no handlers, so skip it all
        var handlers = this.handlers[event] && this.handlers[event].slice();
        if (!handlers || !handlers.length) {
            return;
        }

        data.type = event;
        data.preventDefault = function() {
            data.srcEvent.preventDefault();
        };

        var i = 0;
        while (i < handlers.length) {
            handlers[i](data);
            i++;
        }
    },

    /**
     * destroy the manager and unbinds all events
     * it doesn't unbind dom events, that is the user own responsibility
     */
    destroy: function() {
        this.element && toggleCssProps(this, false);

        this.handlers = {};
        this.session = {};
        this.input.destroy();
        this.element = null;
    }
};

/**
 * add/remove the css properties as defined in manager.options.cssProps
 * @param {Manager} manager
 * @param {Boolean} add
 */
function toggleCssProps(manager, add) {
    var element = manager.element;
    if (!element.style) {
        return;
    }
    each(manager.options.cssProps, function(value, name) {
        element.style[prefixed(element.style, name)] = add ? value : '';
    });
}

/**
 * trigger dom event
 * @param {String} event
 * @param {Object} data
 */
function triggerDomEvent(event, data) {
    var gestureEvent = document.createEvent('Event');
    gestureEvent.initEvent(event, true, true);
    gestureEvent.gesture = data;
    data.target.dispatchEvent(gestureEvent);
}

assign(Hammer, {
    INPUT_START: INPUT_START,
    INPUT_MOVE: INPUT_MOVE,
    INPUT_END: INPUT_END,
    INPUT_CANCEL: INPUT_CANCEL,

    STATE_POSSIBLE: STATE_POSSIBLE,
    STATE_BEGAN: STATE_BEGAN,
    STATE_CHANGED: STATE_CHANGED,
    STATE_ENDED: STATE_ENDED,
    STATE_RECOGNIZED: STATE_RECOGNIZED,
    STATE_CANCELLED: STATE_CANCELLED,
    STATE_FAILED: STATE_FAILED,

    DIRECTION_NONE: DIRECTION_NONE,
    DIRECTION_LEFT: DIRECTION_LEFT,
    DIRECTION_RIGHT: DIRECTION_RIGHT,
    DIRECTION_UP: DIRECTION_UP,
    DIRECTION_DOWN: DIRECTION_DOWN,
    DIRECTION_HORIZONTAL: DIRECTION_HORIZONTAL,
    DIRECTION_VERTICAL: DIRECTION_VERTICAL,
    DIRECTION_ALL: DIRECTION_ALL,

    Manager: Manager,
    Input: Input,
    TouchAction: TouchAction,

    TouchInput: TouchInput,
    MouseInput: MouseInput,
    PointerEventInput: PointerEventInput,
    TouchMouseInput: TouchMouseInput,
    SingleTouchInput: SingleTouchInput,

    Recognizer: Recognizer,
    AttrRecognizer: AttrRecognizer,
    Tap: TapRecognizer,
    Pan: PanRecognizer,
    Swipe: SwipeRecognizer,
    Pinch: PinchRecognizer,
    Rotate: RotateRecognizer,
    Press: PressRecognizer,

    on: addEventListeners,
    off: removeEventListeners,
    each: each,
    merge: merge,
    extend: extend,
    assign: assign,
    inherit: inherit,
    bindFn: bindFn,
    prefixed: prefixed
});

// this prevents errors when Hammer is loaded in the presence of an AMD
//  style loader but by script tag, not by the loader.
var freeGlobal = (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {})); // jshint ignore:line
freeGlobal.Hammer = Hammer;

if (typeof define === 'function' && define.amd) {
    define(function() {
        return Hammer;
    });
} else if (typeof module != 'undefined' && module.exports) {
    module.exports = Hammer;
} else {
    window[exportName] = Hammer;
}

})(window, document, 'Hammer');

},{}],76:[function(require,module,exports){
"use strict";
/**
 * Created by Alex on 11/6/2014.
 */

// https://github.com/umdjs/umd/blob/master/returnExports.js#L40-L60
// if the module has no dependencies, the above pattern can be simplified to
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.keycharm = factory();
  }
}(this, function () {

  function keycharm(options) {
    var preventDefault = options && options.preventDefault || false;

    var container = options && options.container || window;

    var _exportFunctions = {};
    var _bound = {keydown:{}, keyup:{}};
    var _keys = {};
    var i;

    // a - z
    for (i = 97; i <= 122; i++) {_keys[String.fromCharCode(i)] = {code:65 + (i - 97), shift: false};}
    // A - Z
    for (i = 65; i <= 90; i++) {_keys[String.fromCharCode(i)] = {code:i, shift: true};}
    // 0 - 9
    for (i = 0;  i <= 9;   i++) {_keys['' + i] = {code:48 + i, shift: false};}
    // F1 - F12
    for (i = 1;  i <= 12;   i++) {_keys['F' + i] = {code:111 + i, shift: false};}
    // num0 - num9
    for (i = 0;  i <= 9;   i++) {_keys['num' + i] = {code:96 + i, shift: false};}

    // numpad misc
    _keys['num*'] = {code:106, shift: false};
    _keys['num+'] = {code:107, shift: false};
    _keys['num-'] = {code:109, shift: false};
    _keys['num/'] = {code:111, shift: false};
    _keys['num.'] = {code:110, shift: false};
    // arrows
    _keys['left']  = {code:37, shift: false};
    _keys['up']    = {code:38, shift: false};
    _keys['right'] = {code:39, shift: false};
    _keys['down']  = {code:40, shift: false};
    // extra keys
    _keys['space'] = {code:32, shift: false};
    _keys['enter'] = {code:13, shift: false};
    _keys['shift'] = {code:16, shift: undefined};
    _keys['esc']   = {code:27, shift: false};
    _keys['backspace'] = {code:8, shift: false};
    _keys['tab']       = {code:9, shift: false};
    _keys['ctrl']      = {code:17, shift: false};
    _keys['alt']       = {code:18, shift: false};
    _keys['delete']    = {code:46, shift: false};
    _keys['pageup']    = {code:33, shift: false};
    _keys['pagedown']  = {code:34, shift: false};
    // symbols
    _keys['=']     = {code:187, shift: false};
    _keys['-']     = {code:189, shift: false};
    _keys[']']     = {code:221, shift: false};
    _keys['[']     = {code:219, shift: false};



    var down = function(event) {handleEvent(event,'keydown');};
    var up = function(event) {handleEvent(event,'keyup');};

    // handle the actualy bound key with the event
    var handleEvent = function(event,type) {
      if (_bound[type][event.keyCode] !== undefined) {
        var bound = _bound[type][event.keyCode];
        for (var i = 0; i < bound.length; i++) {
          if (bound[i].shift === undefined) {
            bound[i].fn(event);
          }
          else if (bound[i].shift == true && event.shiftKey == true) {
            bound[i].fn(event);
          }
          else if (bound[i].shift == false && event.shiftKey == false) {
            bound[i].fn(event);
          }
        }

        if (preventDefault == true) {
          event.preventDefault();
        }
      }
    };

    // bind a key to a callback
    _exportFunctions.bind = function(key, callback, type) {
      if (type === undefined) {
        type = 'keydown';
      }
      if (_keys[key] === undefined) {
        throw new Error("unsupported key: " + key);
      }
      if (_bound[type][_keys[key].code] === undefined) {
        _bound[type][_keys[key].code] = [];
      }
      _bound[type][_keys[key].code].push({fn:callback, shift:_keys[key].shift});
    };


    // bind all keys to a call back (demo purposes)
    _exportFunctions.bindAll = function(callback, type) {
      if (type === undefined) {
        type = 'keydown';
      }
      for (var key in _keys) {
        if (_keys.hasOwnProperty(key)) {
          _exportFunctions.bind(key,callback,type);
        }
      }
    };

    // get the key label from an event
    _exportFunctions.getKey = function(event) {
      for (var key in _keys) {
        if (_keys.hasOwnProperty(key)) {
          if (event.shiftKey == true && _keys[key].shift == true && event.keyCode == _keys[key].code) {
            return key;
          }
          else if (event.shiftKey == false && _keys[key].shift == false && event.keyCode == _keys[key].code) {
            return key;
          }
          else if (event.keyCode == _keys[key].code && key == 'shift') {
            return key;
          }
        }
      }
      return "unknown key, currently not supported";
    };

    // unbind either a specific callback from a key or all of them (by leaving callback undefined)
    _exportFunctions.unbind = function(key, callback, type) {
      if (type === undefined) {
        type = 'keydown';
      }
      if (_keys[key] === undefined) {
        throw new Error("unsupported key: " + key);
      }
      if (callback !== undefined) {
        var newBindings = [];
        var bound = _bound[type][_keys[key].code];
        if (bound !== undefined) {
          for (var i = 0; i < bound.length; i++) {
            if (!(bound[i].fn == callback && bound[i].shift == _keys[key].shift)) {
              newBindings.push(_bound[type][_keys[key].code][i]);
            }
          }
        }
        _bound[type][_keys[key].code] = newBindings;
      }
      else {
        _bound[type][_keys[key].code] = [];
      }
    };

    // reset all bound variables.
    _exportFunctions.reset = function() {
      _bound = {keydown:{}, keyup:{}};
    };

    // unbind all listeners and reset all variables.
    _exportFunctions.destroy = function() {
      _bound = {keydown:{}, keyup:{}};
      container.removeEventListener('keydown', down, true);
      container.removeEventListener('keyup', up, true);
    };

    // create listeners.
    container.addEventListener('keydown',down,true);
    container.addEventListener('keyup',up,true);

    // return the public functions.
    return _exportFunctions;
  }

  return keycharm;
}));



},{}],77:[function(require,module,exports){
//! moment.js
//! version : 2.11.0
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    global.moment = factory()
}(this, function () { 'use strict';

    var hookCallback;

    function utils_hooks__hooks () {
        return hookCallback.apply(null, arguments);
    }

    // This is done to register the method called with moment()
    // without creating circular dependencies.
    function setHookCallback (callback) {
        hookCallback = callback;
    }

    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
    }

    function map(arr, fn) {
        var res = [], i;
        for (i = 0; i < arr.length; ++i) {
            res.push(fn(arr[i], i));
        }
        return res;
    }

    function hasOwnProp(a, b) {
        return Object.prototype.hasOwnProperty.call(a, b);
    }

    function extend(a, b) {
        for (var i in b) {
            if (hasOwnProp(b, i)) {
                a[i] = b[i];
            }
        }

        if (hasOwnProp(b, 'toString')) {
            a.toString = b.toString;
        }

        if (hasOwnProp(b, 'valueOf')) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function create_utc__createUTC (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, true).utc();
    }

    function defaultParsingFlags() {
        // We need to deep clone this object.
        return {
            empty           : false,
            unusedTokens    : [],
            unusedInput     : [],
            overflow        : -2,
            charsLeftOver   : 0,
            nullInput       : false,
            invalidMonth    : null,
            invalidFormat   : false,
            userInvalidated : false,
            iso             : false
        };
    }

    function getParsingFlags(m) {
        if (m._pf == null) {
            m._pf = defaultParsingFlags();
        }
        return m._pf;
    }

    function valid__isValid(m) {
        if (m._isValid == null) {
            var flags = getParsingFlags(m);
            m._isValid = !isNaN(m._d.getTime()) &&
                flags.overflow < 0 &&
                !flags.empty &&
                !flags.invalidMonth &&
                !flags.invalidWeekday &&
                !flags.nullInput &&
                !flags.invalidFormat &&
                !flags.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    flags.charsLeftOver === 0 &&
                    flags.unusedTokens.length === 0 &&
                    flags.bigHour === undefined;
            }
        }
        return m._isValid;
    }

    function valid__createInvalid (flags) {
        var m = create_utc__createUTC(NaN);
        if (flags != null) {
            extend(getParsingFlags(m), flags);
        }
        else {
            getParsingFlags(m).userInvalidated = true;
        }

        return m;
    }

    function isUndefined(input) {
        return input === void 0;
    }

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    var momentProperties = utils_hooks__hooks.momentProperties = [];

    function copyConfig(to, from) {
        var i, prop, val;

        if (!isUndefined(from._isAMomentObject)) {
            to._isAMomentObject = from._isAMomentObject;
        }
        if (!isUndefined(from._i)) {
            to._i = from._i;
        }
        if (!isUndefined(from._f)) {
            to._f = from._f;
        }
        if (!isUndefined(from._l)) {
            to._l = from._l;
        }
        if (!isUndefined(from._strict)) {
            to._strict = from._strict;
        }
        if (!isUndefined(from._tzm)) {
            to._tzm = from._tzm;
        }
        if (!isUndefined(from._isUTC)) {
            to._isUTC = from._isUTC;
        }
        if (!isUndefined(from._offset)) {
            to._offset = from._offset;
        }
        if (!isUndefined(from._pf)) {
            to._pf = getParsingFlags(from);
        }
        if (!isUndefined(from._locale)) {
            to._locale = from._locale;
        }

        if (momentProperties.length > 0) {
            for (i in momentProperties) {
                prop = momentProperties[i];
                val = from[prop];
                if (!isUndefined(val)) {
                    to[prop] = val;
                }
            }
        }

        return to;
    }

    var updateInProgress = false;

    // Moment prototype object
    function Moment(config) {
        copyConfig(this, config);
        this._d = new Date(config._d != null ? config._d.getTime() : NaN);
        // Prevent infinite loop in case updateOffset creates new moment
        // objects.
        if (updateInProgress === false) {
            updateInProgress = true;
            utils_hooks__hooks.updateOffset(this);
            updateInProgress = false;
        }
    }

    function isMoment (obj) {
        return obj instanceof Moment || (obj != null && obj._isAMomentObject != null);
    }

    function absFloor (number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            value = absFloor(coercedNumber);
        }

        return value;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function Locale() {
    }

    // internal storage for locale config files
    var locales = {};
    var globalLocale;

    function normalizeLocale(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // pick the locale from the array
    // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
    // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
    function chooseLocale(names) {
        var i = 0, j, next, locale, split;

        while (i < names.length) {
            split = normalizeLocale(names[i]).split('-');
            j = split.length;
            next = normalizeLocale(names[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                locale = loadLocale(split.slice(0, j).join('-'));
                if (locale) {
                    return locale;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return null;
    }

    function loadLocale(name) {
        var oldLocale = null;
        // TODO: Find a better way to register and load all the locales in Node
        if (!locales[name] && !isUndefined(module) &&
                module && module.exports) {
            try {
                oldLocale = globalLocale._abbr;
                require('./locale/' + name);
                // because defineLocale currently also sets the global locale, we
                // want to undo that for lazy loaded locales
                locale_locales__getSetGlobalLocale(oldLocale);
            } catch (e) { }
        }
        return locales[name];
    }

    // This function will load locale and then set the global locale.  If
    // no arguments are passed in, it will simply return the current global
    // locale key.
    function locale_locales__getSetGlobalLocale (key, values) {
        var data;
        if (key) {
            if (isUndefined(values)) {
                data = locale_locales__getLocale(key);
            }
            else {
                data = defineLocale(key, values);
            }

            if (data) {
                // moment.duration._locale = moment._locale = data;
                globalLocale = data;
            }
        }

        return globalLocale._abbr;
    }

    function defineLocale (name, values) {
        if (values !== null) {
            values.abbr = name;
            locales[name] = locales[name] || new Locale();
            locales[name].set(values);

            // backwards compat for now: also set the locale
            locale_locales__getSetGlobalLocale(name);

            return locales[name];
        } else {
            // useful for testing
            delete locales[name];
            return null;
        }
    }

    // returns locale data
    function locale_locales__getLocale (key) {
        var locale;

        if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
        }

        if (!key) {
            return globalLocale;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            locale = loadLocale(key);
            if (locale) {
                return locale;
            }
            key = [key];
        }

        return chooseLocale(key);
    }

    var aliases = {};

    function addUnitAlias (unit, shorthand) {
        var lowerCase = unit.toLowerCase();
        aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
    }

    function normalizeUnits(units) {
        return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (hasOwnProp(inputObject, prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function isFunction(input) {
        return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
    }

    function makeGetSet (unit, keepTime) {
        return function (value) {
            if (value != null) {
                get_set__set(this, unit, value);
                utils_hooks__hooks.updateOffset(this, keepTime);
                return this;
            } else {
                return get_set__get(this, unit);
            }
        };
    }

    function get_set__get (mom, unit) {
        return mom.isValid() ?
            mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]() : NaN;
    }

    function get_set__set (mom, unit, value) {
        if (mom.isValid()) {
            mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    // MOMENTS

    function getSet (units, value) {
        var unit;
        if (typeof units === 'object') {
            for (unit in units) {
                this.set(unit, units[unit]);
            }
        } else {
            units = normalizeUnits(units);
            if (isFunction(this[units])) {
                return this[units](value);
            }
        }
        return this;
    }

    function zeroFill(number, targetLength, forceSign) {
        var absNumber = '' + Math.abs(number),
            zerosToFill = targetLength - absNumber.length,
            sign = number >= 0;
        return (sign ? (forceSign ? '+' : '') : '-') +
            Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
    }

    var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g;

    var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

    var formatFunctions = {};

    var formatTokenFunctions = {};

    // token:    'M'
    // padded:   ['MM', 2]
    // ordinal:  'Mo'
    // callback: function () { this.month() + 1 }
    function addFormatToken (token, padded, ordinal, callback) {
        var func = callback;
        if (typeof callback === 'string') {
            func = function () {
                return this[callback]();
            };
        }
        if (token) {
            formatTokenFunctions[token] = func;
        }
        if (padded) {
            formatTokenFunctions[padded[0]] = function () {
                return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
            };
        }
        if (ordinal) {
            formatTokenFunctions[ordinal] = function () {
                return this.localeData().ordinal(func.apply(this, arguments), token);
            };
        }
    }

    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, '');
        }
        return input.replace(/\\/g, '');
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = '';
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {
        if (!m.isValid()) {
            return m.localeData().invalidDate();
        }

        format = expandFormat(format, m.localeData());
        formatFunctions[format] = formatFunctions[format] || makeFormatFunction(format);

        return formatFunctions[format](m);
    }

    function expandFormat(format, locale) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return locale.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }

    var match1         = /\d/;            //       0 - 9
    var match2         = /\d\d/;          //      00 - 99
    var match3         = /\d{3}/;         //     000 - 999
    var match4         = /\d{4}/;         //    0000 - 9999
    var match6         = /[+-]?\d{6}/;    // -999999 - 999999
    var match1to2      = /\d\d?/;         //       0 - 99
    var match3to4      = /\d\d\d\d?/;     //     999 - 9999
    var match5to6      = /\d\d\d\d\d\d?/; //   99999 - 999999
    var match1to3      = /\d{1,3}/;       //       0 - 999
    var match1to4      = /\d{1,4}/;       //       0 - 9999
    var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

    var matchUnsigned  = /\d+/;           //       0 - inf
    var matchSigned    = /[+-]?\d+/;      //    -inf - inf

    var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z
    var matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi; // +00 -00 +00:00 -00:00 +0000 -0000 or Z

    var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

    // any word (or two) characters or numbers including two/three word month in arabic.
    // includes scottish gaelic two word and hyphenated months
    var matchWord = /[0-9]*(a[mn]\s?)?['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF\-]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i;


    var regexes = {};

    function addRegexToken (token, regex, strictRegex) {
        regexes[token] = isFunction(regex) ? regex : function (isStrict) {
            return (isStrict && strictRegex) ? strictRegex : regex;
        };
    }

    function getParseRegexForToken (token, config) {
        if (!hasOwnProp(regexes, token)) {
            return new RegExp(unescapeFormat(token));
        }

        return regexes[token](config._strict, config._locale);
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function unescapeFormat(s) {
        return s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        }).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    var tokens = {};

    function addParseToken (token, callback) {
        var i, func = callback;
        if (typeof token === 'string') {
            token = [token];
        }
        if (typeof callback === 'number') {
            func = function (input, array) {
                array[callback] = toInt(input);
            };
        }
        for (i = 0; i < token.length; i++) {
            tokens[token[i]] = func;
        }
    }

    function addWeekParseToken (token, callback) {
        addParseToken(token, function (input, array, config, token) {
            config._w = config._w || {};
            callback(input, config._w, config, token);
        });
    }

    function addTimeToArrayFromToken(token, input, config) {
        if (input != null && hasOwnProp(tokens, token)) {
            tokens[token](input, config._a, config, token);
        }
    }

    var YEAR = 0;
    var MONTH = 1;
    var DATE = 2;
    var HOUR = 3;
    var MINUTE = 4;
    var SECOND = 5;
    var MILLISECOND = 6;
    var WEEK = 7;
    var WEEKDAY = 8;

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    // FORMATTING

    addFormatToken('M', ['MM', 2], 'Mo', function () {
        return this.month() + 1;
    });

    addFormatToken('MMM', 0, 0, function (format) {
        return this.localeData().monthsShort(this, format);
    });

    addFormatToken('MMMM', 0, 0, function (format) {
        return this.localeData().months(this, format);
    });

    // ALIASES

    addUnitAlias('month', 'M');

    // PARSING

    addRegexToken('M',    match1to2);
    addRegexToken('MM',   match1to2, match2);
    addRegexToken('MMM',  matchWord);
    addRegexToken('MMMM', matchWord);

    addParseToken(['M', 'MM'], function (input, array) {
        array[MONTH] = toInt(input) - 1;
    });

    addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
        var month = config._locale.monthsParse(input, token, config._strict);
        // if we didn't find a month name, mark the date as invalid.
        if (month != null) {
            array[MONTH] = month;
        } else {
            getParsingFlags(config).invalidMonth = input;
        }
    });

    // LOCALES

    var MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s+)+MMMM?/;
    var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
    function localeMonths (m, format) {
        return isArray(this._months) ? this._months[m.month()] :
            this._months[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
    }

    var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sept_Oct_Nov_Dec'.split('_');
    function localeMonthsShort (m, format) {
        return isArray(this._monthsShort) ? this._monthsShort[m.month()] :
            this._monthsShort[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
    }

    function localeMonthsParse (monthName, format, strict) {
        var i, mom, regex;

        if (!this._monthsParse) {
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
        }

        for (i = 0; i < 12; i++) {
            // make the regex if we don't have it already
            mom = create_utc__createUTC([2000, i]);
            if (strict && !this._longMonthsParse[i]) {
                this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
                this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
            }
            if (!strict && !this._monthsParse[i]) {
                regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
                return i;
            } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
                return i;
            } else if (!strict && this._monthsParse[i].test(monthName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function setMonth (mom, value) {
        var dayOfMonth;

        if (!mom.isValid()) {
            // No op
            return mom;
        }

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.localeData().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function getSetMonth (value) {
        if (value != null) {
            setMonth(this, value);
            utils_hooks__hooks.updateOffset(this, true);
            return this;
        } else {
            return get_set__get(this, 'Month');
        }
    }

    function getDaysInMonth () {
        return daysInMonth(this.year(), this.month());
    }

    function checkOverflow (m) {
        var overflow;
        var a = m._a;

        if (a && getParsingFlags(m).overflow === -2) {
            overflow =
                a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
                a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
                a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
                a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
                a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
                a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }
            if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
                overflow = WEEK;
            }
            if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
                overflow = WEEKDAY;
            }

            getParsingFlags(m).overflow = overflow;
        }

        return m;
    }

    function warn(msg) {
        if (utils_hooks__hooks.suppressDeprecationWarnings === false && !isUndefined(console) && console.warn) {
            console.warn('Deprecation warning: ' + msg);
        }
    }

    function deprecate(msg, fn) {
        var firstTime = true;

        return extend(function () {
            if (firstTime) {
                warn(msg + '\nArguments: ' + Array.prototype.slice.call(arguments).join(', ') + '\n' + (new Error()).stack);
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    var deprecations = {};

    function deprecateSimple(name, msg) {
        if (!deprecations[name]) {
            warn(msg);
            deprecations[name] = true;
        }
    }

    utils_hooks__hooks.suppressDeprecationWarnings = false;

    // iso 8601 regex
    // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
    var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?/;
    var basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?/;

    var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;

    var isoDates = [
        ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
        ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
        ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
        ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
        ['YYYY-DDD', /\d{4}-\d{3}/],
        ['YYYY-MM', /\d{4}-\d\d/, false],
        ['YYYYYYMMDD', /[+-]\d{10}/],
        ['YYYYMMDD', /\d{8}/],
        // YYYYMM is NOT allowed by the standard
        ['GGGG[W]WWE', /\d{4}W\d{3}/],
        ['GGGG[W]WW', /\d{4}W\d{2}/, false],
        ['YYYYDDD', /\d{7}/]
    ];

    // iso time formats and regexes
    var isoTimes = [
        ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
        ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
        ['HH:mm:ss', /\d\d:\d\d:\d\d/],
        ['HH:mm', /\d\d:\d\d/],
        ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
        ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
        ['HHmmss', /\d\d\d\d\d\d/],
        ['HHmm', /\d\d\d\d/],
        ['HH', /\d\d/]
    ];

    var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

    // date from iso format
    function configFromISO(config) {
        var i, l,
            string = config._i,
            match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
            allowTime, dateFormat, timeFormat, tzFormat;

        if (match) {
            getParsingFlags(config).iso = true;

            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(match[1])) {
                    dateFormat = isoDates[i][0];
                    allowTime = isoDates[i][2] !== false;
                    break;
                }
            }
            if (dateFormat == null) {
                config._isValid = false;
                return;
            }
            if (match[3]) {
                for (i = 0, l = isoTimes.length; i < l; i++) {
                    if (isoTimes[i][1].exec(match[3])) {
                        // match[2] should be 'T' or space
                        timeFormat = (match[2] || ' ') + isoTimes[i][0];
                        break;
                    }
                }
                if (timeFormat == null) {
                    config._isValid = false;
                    return;
                }
            }
            if (!allowTime && timeFormat != null) {
                config._isValid = false;
                return;
            }
            if (match[4]) {
                if (tzRegex.exec(match[4])) {
                    tzFormat = 'Z';
                } else {
                    config._isValid = false;
                    return;
                }
            }
            config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
            configFromStringAndFormat(config);
        } else {
            config._isValid = false;
        }
    }

    // date from iso format or fallback
    function configFromString(config) {
        var matched = aspNetJsonRegex.exec(config._i);

        if (matched !== null) {
            config._d = new Date(+matched[1]);
            return;
        }

        configFromISO(config);
        if (config._isValid === false) {
            delete config._isValid;
            utils_hooks__hooks.createFromInputFallback(config);
        }
    }

    utils_hooks__hooks.createFromInputFallback = deprecate(
        'moment construction falls back to js Date. This is ' +
        'discouraged and will be removed in upcoming major ' +
        'release. Please refer to ' +
        'https://github.com/moment/moment/issues/1407 for more info.',
        function (config) {
            config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
        }
    );

    function createDate (y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor remaps years 0-99 to 1900-1999
        if (y < 100 && y >= 0 && isFinite(date.getFullYear())) {
            date.setFullYear(y);
        }
        return date;
    }

    function createUTCDate (y) {
        var date = new Date(Date.UTC.apply(null, arguments));

        //the Date.UTC function remaps years 0-99 to 1900-1999
        if (y < 100 && y >= 0 && isFinite(date.getUTCFullYear())) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    // FORMATTING

    addFormatToken(0, ['YY', 2], 0, function () {
        return this.year() % 100;
    });

    addFormatToken(0, ['YYYY',   4],       0, 'year');
    addFormatToken(0, ['YYYYY',  5],       0, 'year');
    addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

    // ALIASES

    addUnitAlias('year', 'y');

    // PARSING

    addRegexToken('Y',      matchSigned);
    addRegexToken('YY',     match1to2, match2);
    addRegexToken('YYYY',   match1to4, match4);
    addRegexToken('YYYYY',  match1to6, match6);
    addRegexToken('YYYYYY', match1to6, match6);

    addParseToken(['YYYYY', 'YYYYYY'], YEAR);
    addParseToken('YYYY', function (input, array) {
        array[YEAR] = input.length === 2 ? utils_hooks__hooks.parseTwoDigitYear(input) : toInt(input);
    });
    addParseToken('YY', function (input, array) {
        array[YEAR] = utils_hooks__hooks.parseTwoDigitYear(input);
    });

    // HELPERS

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    // HOOKS

    utils_hooks__hooks.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    // MOMENTS

    var getSetYear = makeGetSet('FullYear', false);

    function getIsLeapYear () {
        return isLeapYear(this.year());
    }

    // start-of-first-week - start-of-year
    function firstWeekOffset(year, dow, doy) {
        var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
            fwd = 7 + dow - doy,
            // first-week day local weekday -- which local weekday is fwd
            fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

        return -fwdlw + fwd - 1;
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
        var localWeekday = (7 + weekday - dow) % 7,
            weekOffset = firstWeekOffset(year, dow, doy),
            dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
            resYear, resDayOfYear;

        if (dayOfYear <= 0) {
            resYear = year - 1;
            resDayOfYear = daysInYear(resYear) + dayOfYear;
        } else if (dayOfYear > daysInYear(year)) {
            resYear = year + 1;
            resDayOfYear = dayOfYear - daysInYear(year);
        } else {
            resYear = year;
            resDayOfYear = dayOfYear;
        }

        return {
            year: resYear,
            dayOfYear: resDayOfYear
        };
    }

    function weekOfYear(mom, dow, doy) {
        var weekOffset = firstWeekOffset(mom.year(), dow, doy),
            week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
            resWeek, resYear;

        if (week < 1) {
            resYear = mom.year() - 1;
            resWeek = week + weeksInYear(resYear, dow, doy);
        } else if (week > weeksInYear(mom.year(), dow, doy)) {
            resWeek = week - weeksInYear(mom.year(), dow, doy);
            resYear = mom.year() + 1;
        } else {
            resYear = mom.year();
            resWeek = week;
        }

        return {
            week: resWeek,
            year: resYear
        };
    }

    function weeksInYear(year, dow, doy) {
        var weekOffset = firstWeekOffset(year, dow, doy),
            weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
        return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
    }

    // Pick the first defined of two or three arguments.
    function defaults(a, b, c) {
        if (a != null) {
            return a;
        }
        if (b != null) {
            return b;
        }
        return c;
    }

    function currentDateArray(config) {
        // hooks is actually the exported moment object
        var nowValue = new Date(utils_hooks__hooks.now());
        if (config._useUTC) {
            return [nowValue.getUTCFullYear(), nowValue.getUTCMonth(), nowValue.getUTCDate()];
        }
        return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function configFromArray (config) {
        var i, date, input = [], currentDate, yearToUse;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

            if (config._dayOfYear > daysInYear(yearToUse)) {
                getParsingFlags(config)._overflowDayOfYear = true;
            }

            date = createUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // Check for 24:00:00.000
        if (config._a[HOUR] === 24 &&
                config._a[MINUTE] === 0 &&
                config._a[SECOND] === 0 &&
                config._a[MILLISECOND] === 0) {
            config._nextDay = true;
            config._a[HOUR] = 0;
        }

        config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
        // Apply timezone offset from input. The actual utcOffset can be changed
        // with parseZone.
        if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
        }

        if (config._nextDay) {
            config._a[HOUR] = 24;
        }
    }

    function dayOfYearFromWeekInfo(config) {
        var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow;

        w = config._w;
        if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;

            // TODO: We need to take the current isoWeekYear, but that depends on
            // how we interpret now (local, utc, fixed offset). So create
            // a now version of current config (take local/utc/offset flags, and
            // create now).
            weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(local__createLocal(), 1, 4).year);
            week = defaults(w.W, 1);
            weekday = defaults(w.E, 1);
            if (weekday < 1 || weekday > 7) {
                weekdayOverflow = true;
            }
        } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;

            weekYear = defaults(w.gg, config._a[YEAR], weekOfYear(local__createLocal(), dow, doy).year);
            week = defaults(w.w, 1);

            if (w.d != null) {
                // weekday -- low day numbers are considered next week
                weekday = w.d;
                if (weekday < 0 || weekday > 6) {
                    weekdayOverflow = true;
                }
            } else if (w.e != null) {
                // local weekday -- counting starts from begining of week
                weekday = w.e + dow;
                if (w.e < 0 || w.e > 6) {
                    weekdayOverflow = true;
                }
            } else {
                // default to begining of week
                weekday = dow;
            }
        }
        if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
            getParsingFlags(config)._overflowWeeks = true;
        } else if (weekdayOverflow != null) {
            getParsingFlags(config)._overflowWeekday = true;
        } else {
            temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
            config._a[YEAR] = temp.year;
            config._dayOfYear = temp.dayOfYear;
        }
    }

    // constant that refers to the ISO standard
    utils_hooks__hooks.ISO_8601 = function () {};

    // date from string and format string
    function configFromStringAndFormat(config) {
        // TODO: Move this to another part of the creation flow to prevent circular deps
        if (config._f === utils_hooks__hooks.ISO_8601) {
            configFromISO(config);
            return;
        }

        config._a = [];
        getParsingFlags(config).empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    getParsingFlags(config).unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    getParsingFlags(config).empty = false;
                }
                else {
                    getParsingFlags(config).unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                getParsingFlags(config).unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            getParsingFlags(config).unusedInput.push(string);
        }

        // clear _12h flag if hour is <= 12
        if (getParsingFlags(config).bigHour === true &&
                config._a[HOUR] <= 12 &&
                config._a[HOUR] > 0) {
            getParsingFlags(config).bigHour = undefined;
        }
        // handle meridiem
        config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

        configFromArray(config);
        checkOverflow(config);
    }


    function meridiemFixWrap (locale, hour, meridiem) {
        var isPm;

        if (meridiem == null) {
            // nothing to do
            return hour;
        }
        if (locale.meridiemHour != null) {
            return locale.meridiemHour(hour, meridiem);
        } else if (locale.isPM != null) {
            // Fallback
            isPm = locale.isPM(meridiem);
            if (isPm && hour < 12) {
                hour += 12;
            }
            if (!isPm && hour === 12) {
                hour = 0;
            }
            return hour;
        } else {
            // this is not supposed to happen
            return hour;
        }
    }

    // date from string and array of format strings
    function configFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            getParsingFlags(config).invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = copyConfig({}, config);
            if (config._useUTC != null) {
                tempConfig._useUTC = config._useUTC;
            }
            tempConfig._f = config._f[i];
            configFromStringAndFormat(tempConfig);

            if (!valid__isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += getParsingFlags(tempConfig).charsLeftOver;

            //or tokens
            currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

            getParsingFlags(tempConfig).score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    function configFromObject(config) {
        if (config._d) {
            return;
        }

        var i = normalizeObjectUnits(config._i);
        config._a = map([i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond], function (obj) {
            return obj && parseInt(obj, 10);
        });

        configFromArray(config);
    }

    function createFromConfig (config) {
        var res = new Moment(checkOverflow(prepareConfig(config)));
        if (res._nextDay) {
            // Adding is smart enough around DST
            res.add(1, 'd');
            res._nextDay = undefined;
        }

        return res;
    }

    function prepareConfig (config) {
        var input = config._i,
            format = config._f;

        config._locale = config._locale || locale_locales__getLocale(config._l);

        if (input === null || (format === undefined && input === '')) {
            return valid__createInvalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = config._locale.preparse(input);
        }

        if (isMoment(input)) {
            return new Moment(checkOverflow(input));
        } else if (isArray(format)) {
            configFromStringAndArray(config);
        } else if (format) {
            configFromStringAndFormat(config);
        } else if (isDate(input)) {
            config._d = input;
        } else {
            configFromInput(config);
        }

        if (!valid__isValid(config)) {
            config._d = null;
        }

        return config;
    }

    function configFromInput(config) {
        var input = config._i;
        if (input === undefined) {
            config._d = new Date(utils_hooks__hooks.now());
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if (typeof input === 'string') {
            configFromString(config);
        } else if (isArray(input)) {
            config._a = map(input.slice(0), function (obj) {
                return parseInt(obj, 10);
            });
            configFromArray(config);
        } else if (typeof(input) === 'object') {
            configFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            utils_hooks__hooks.createFromInputFallback(config);
        }
    }

    function createLocalOrUTC (input, format, locale, strict, isUTC) {
        var c = {};

        if (typeof(locale) === 'boolean') {
            strict = locale;
            locale = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c._isAMomentObject = true;
        c._useUTC = c._isUTC = isUTC;
        c._l = locale;
        c._i = input;
        c._f = format;
        c._strict = strict;

        return createFromConfig(c);
    }

    function local__createLocal (input, format, locale, strict) {
        return createLocalOrUTC(input, format, locale, strict, false);
    }

    var prototypeMin = deprecate(
         'moment().min is deprecated, use moment.min instead. https://github.com/moment/moment/issues/1548',
         function () {
             var other = local__createLocal.apply(null, arguments);
             if (this.isValid() && other.isValid()) {
                 return other < this ? this : other;
             } else {
                 return valid__createInvalid();
             }
         }
     );

    var prototypeMax = deprecate(
        'moment().max is deprecated, use moment.max instead. https://github.com/moment/moment/issues/1548',
        function () {
            var other = local__createLocal.apply(null, arguments);
            if (this.isValid() && other.isValid()) {
                return other > this ? this : other;
            } else {
                return valid__createInvalid();
            }
        }
    );

    // Pick a moment m from moments so that m[fn](other) is true for all
    // other. This relies on the function fn to be transitive.
    //
    // moments should either be an array of moment objects or an array, whose
    // first element is an array of moment objects.
    function pickBy(fn, moments) {
        var res, i;
        if (moments.length === 1 && isArray(moments[0])) {
            moments = moments[0];
        }
        if (!moments.length) {
            return local__createLocal();
        }
        res = moments[0];
        for (i = 1; i < moments.length; ++i) {
            if (!moments[i].isValid() || moments[i][fn](res)) {
                res = moments[i];
            }
        }
        return res;
    }

    // TODO: Use [].sort instead?
    function min () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isBefore', args);
    }

    function max () {
        var args = [].slice.call(arguments, 0);

        return pickBy('isAfter', args);
    }

    var now = Date.now || function () {
        return +(new Date());
    };

    function Duration (duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._locale = locale_locales__getLocale();

        this._bubble();
    }

    function isDuration (obj) {
        return obj instanceof Duration;
    }

    // FORMATTING

    function offset (token, separator) {
        addFormatToken(token, 0, 0, function () {
            var offset = this.utcOffset();
            var sign = '+';
            if (offset < 0) {
                offset = -offset;
                sign = '-';
            }
            return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
        });
    }

    offset('Z', ':');
    offset('ZZ', '');

    // PARSING

    addRegexToken('Z',  matchShortOffset);
    addRegexToken('ZZ', matchShortOffset);
    addParseToken(['Z', 'ZZ'], function (input, array, config) {
        config._useUTC = true;
        config._tzm = offsetFromString(matchShortOffset, input);
    });

    // HELPERS

    // timezone chunker
    // '+10:00' > ['10',  '00']
    // '-1530'  > ['-15', '30']
    var chunkOffset = /([\+\-]|\d\d)/gi;

    function offsetFromString(matcher, string) {
        var matches = ((string || '').match(matcher) || []);
        var chunk   = matches[matches.length - 1] || [];
        var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
        var minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? minutes : -minutes;
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function cloneWithOffset(input, model) {
        var res, diff;
        if (model._isUTC) {
            res = model.clone();
            diff = (isMoment(input) || isDate(input) ? +input : +local__createLocal(input)) - (+res);
            // Use low-level api, because this fn is low-level api.
            res._d.setTime(+res._d + diff);
            utils_hooks__hooks.updateOffset(res, false);
            return res;
        } else {
            return local__createLocal(input).local();
        }
    }

    function getDateOffset (m) {
        // On Firefox.24 Date#getTimezoneOffset returns a floating point.
        // https://github.com/moment/moment/pull/1871
        return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
    }

    // HOOKS

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    utils_hooks__hooks.updateOffset = function () {};

    // MOMENTS

    // keepLocalTime = true means only change the timezone, without
    // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
    // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
    // +0200, so we adjust the time as needed, to be valid.
    //
    // Keeping the time actually adds/subtracts (one hour)
    // from the actual represented time. That is why we call updateOffset
    // a second time. In case it wants us to change the offset again
    // _changeInProgress == true case, then we have to adjust, because
    // there is no such time in the given timezone.
    function getSetOffset (input, keepLocalTime) {
        var offset = this._offset || 0,
            localAdjust;
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        if (input != null) {
            if (typeof input === 'string') {
                input = offsetFromString(matchShortOffset, input);
            } else if (Math.abs(input) < 16) {
                input = input * 60;
            }
            if (!this._isUTC && keepLocalTime) {
                localAdjust = getDateOffset(this);
            }
            this._offset = input;
            this._isUTC = true;
            if (localAdjust != null) {
                this.add(localAdjust, 'm');
            }
            if (offset !== input) {
                if (!keepLocalTime || this._changeInProgress) {
                    add_subtract__addSubtract(this, create__createDuration(input - offset, 'm'), 1, false);
                } else if (!this._changeInProgress) {
                    this._changeInProgress = true;
                    utils_hooks__hooks.updateOffset(this, true);
                    this._changeInProgress = null;
                }
            }
            return this;
        } else {
            return this._isUTC ? offset : getDateOffset(this);
        }
    }

    function getSetZone (input, keepLocalTime) {
        if (input != null) {
            if (typeof input !== 'string') {
                input = -input;
            }

            this.utcOffset(input, keepLocalTime);

            return this;
        } else {
            return -this.utcOffset();
        }
    }

    function setOffsetToUTC (keepLocalTime) {
        return this.utcOffset(0, keepLocalTime);
    }

    function setOffsetToLocal (keepLocalTime) {
        if (this._isUTC) {
            this.utcOffset(0, keepLocalTime);
            this._isUTC = false;

            if (keepLocalTime) {
                this.subtract(getDateOffset(this), 'm');
            }
        }
        return this;
    }

    function setOffsetToParsedOffset () {
        if (this._tzm) {
            this.utcOffset(this._tzm);
        } else if (typeof this._i === 'string') {
            this.utcOffset(offsetFromString(matchOffset, this._i));
        }
        return this;
    }

    function hasAlignedHourOffset (input) {
        if (!this.isValid()) {
            return false;
        }
        input = input ? local__createLocal(input).utcOffset() : 0;

        return (this.utcOffset() - input) % 60 === 0;
    }

    function isDaylightSavingTime () {
        return (
            this.utcOffset() > this.clone().month(0).utcOffset() ||
            this.utcOffset() > this.clone().month(5).utcOffset()
        );
    }

    function isDaylightSavingTimeShifted () {
        if (!isUndefined(this._isDSTShifted)) {
            return this._isDSTShifted;
        }

        var c = {};

        copyConfig(c, this);
        c = prepareConfig(c);

        if (c._a) {
            var other = c._isUTC ? create_utc__createUTC(c._a) : local__createLocal(c._a);
            this._isDSTShifted = this.isValid() &&
                compareArrays(c._a, other.toArray()) > 0;
        } else {
            this._isDSTShifted = false;
        }

        return this._isDSTShifted;
    }

    function isLocal () {
        return this.isValid() ? !this._isUTC : false;
    }

    function isUtcOffset () {
        return this.isValid() ? this._isUTC : false;
    }

    function isUtc () {
        return this.isValid() ? this._isUTC && this._offset === 0 : false;
    }

    // ASP.NET json date format regex
    var aspNetRegex = /(\-)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/;

    // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
    // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
    var isoRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/;

    function create__createDuration (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            diffRes;

        if (isDuration(input)) {
            duration = {
                ms : input._milliseconds,
                d  : input._days,
                M  : input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y  : 0,
                d  : toInt(match[DATE])        * sign,
                h  : toInt(match[HOUR])        * sign,
                m  : toInt(match[MINUTE])      * sign,
                s  : toInt(match[SECOND])      * sign,
                ms : toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoRegex.exec(input))) {
            sign = (match[1] === '-') ? -1 : 1;
            duration = {
                y : parseIso(match[2], sign),
                M : parseIso(match[3], sign),
                d : parseIso(match[4], sign),
                h : parseIso(match[5], sign),
                m : parseIso(match[6], sign),
                s : parseIso(match[7], sign),
                w : parseIso(match[8], sign)
            };
        } else if (duration == null) {// checks for null or undefined
            duration = {};
        } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
            diffRes = momentsDifference(local__createLocal(duration.from), local__createLocal(duration.to));

            duration = {};
            duration.ms = diffRes.milliseconds;
            duration.M = diffRes.months;
        }

        ret = new Duration(duration);

        if (isDuration(input) && hasOwnProp(input, '_locale')) {
            ret._locale = input._locale;
        }

        return ret;
    }

    create__createDuration.fn = Duration.prototype;

    function parseIso (inp, sign) {
        // We'd normally use ~~inp for this, but unfortunately it also
        // converts floats to ints.
        // inp may be undefined, so careful calling replace on it.
        var res = inp && parseFloat(inp.replace(',', '.'));
        // apply sign while we're at it
        return (isNaN(res) ? 0 : res) * sign;
    }

    function positiveMomentsDifference(base, other) {
        var res = {milliseconds: 0, months: 0};

        res.months = other.month() - base.month() +
            (other.year() - base.year()) * 12;
        if (base.clone().add(res.months, 'M').isAfter(other)) {
            --res.months;
        }

        res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

        return res;
    }

    function momentsDifference(base, other) {
        var res;
        if (!(base.isValid() && other.isValid())) {
            return {milliseconds: 0, months: 0};
        }

        other = cloneWithOffset(other, base);
        if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
        } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
        }

        return res;
    }

    // TODO: remove 'name' arg after deprecation is removed
    function createAdder(direction, name) {
        return function (val, period) {
            var dur, tmp;
            //invert the arguments, but complain about it
            if (period !== null && !isNaN(+period)) {
                deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period).');
                tmp = val; val = period; period = tmp;
            }

            val = typeof val === 'string' ? +val : val;
            dur = create__createDuration(val, period);
            add_subtract__addSubtract(this, dur, direction);
            return this;
        };
    }

    function add_subtract__addSubtract (mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;

        if (!mom.isValid()) {
            // No op
            return;
        }

        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            get_set__set(mom, 'Date', get_set__get(mom, 'Date') + days * isAdding);
        }
        if (months) {
            setMonth(mom, get_set__get(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            utils_hooks__hooks.updateOffset(mom, days || months);
        }
    }

    var add_subtract__add      = createAdder(1, 'add');
    var add_subtract__subtract = createAdder(-1, 'subtract');

    function moment_calendar__calendar (time, formats) {
        // We want to compare the start of today, vs this.
        // Getting start-of-today depends on whether we're local/utc/offset or not.
        var now = time || local__createLocal(),
            sod = cloneWithOffset(now, this).startOf('day'),
            diff = this.diff(sod, 'days', true),
            format = diff < -6 ? 'sameElse' :
                diff < -1 ? 'lastWeek' :
                diff < 0 ? 'lastDay' :
                diff < 1 ? 'sameDay' :
                diff < 2 ? 'nextDay' :
                diff < 7 ? 'nextWeek' : 'sameElse';

        var output = formats && (isFunction(formats[format]) ? formats[format]() : formats[format]);

        return this.format(output || this.localeData().calendar(format, this, local__createLocal(now)));
    }

    function clone () {
        return new Moment(this);
    }

    function isAfter (input, units) {
        var localInput = isMoment(input) ? input : local__createLocal(input);
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
        if (units === 'millisecond') {
            return +this > +localInput;
        } else {
            return +localInput < +this.clone().startOf(units);
        }
    }

    function isBefore (input, units) {
        var localInput = isMoment(input) ? input : local__createLocal(input);
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(!isUndefined(units) ? units : 'millisecond');
        if (units === 'millisecond') {
            return +this < +localInput;
        } else {
            return +this.clone().endOf(units) < +localInput;
        }
    }

    function isBetween (from, to, units) {
        return this.isAfter(from, units) && this.isBefore(to, units);
    }

    function isSame (input, units) {
        var localInput = isMoment(input) ? input : local__createLocal(input),
            inputMs;
        if (!(this.isValid() && localInput.isValid())) {
            return false;
        }
        units = normalizeUnits(units || 'millisecond');
        if (units === 'millisecond') {
            return +this === +localInput;
        } else {
            inputMs = +localInput;
            return +(this.clone().startOf(units)) <= inputMs && inputMs <= +(this.clone().endOf(units));
        }
    }

    function isSameOrAfter (input, units) {
        return this.isSame(input, units) || this.isAfter(input,units);
    }

    function isSameOrBefore (input, units) {
        return this.isSame(input, units) || this.isBefore(input,units);
    }

    function diff (input, units, asFloat) {
        var that,
            zoneDelta,
            delta, output;

        if (!this.isValid()) {
            return NaN;
        }

        that = cloneWithOffset(input, this);

        if (!that.isValid()) {
            return NaN;
        }

        zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

        units = normalizeUnits(units);

        if (units === 'year' || units === 'month' || units === 'quarter') {
            output = monthDiff(this, that);
            if (units === 'quarter') {
                output = output / 3;
            } else if (units === 'year') {
                output = output / 12;
            }
        } else {
            delta = this - that;
            output = units === 'second' ? delta / 1e3 : // 1000
                units === 'minute' ? delta / 6e4 : // 1000 * 60
                units === 'hour' ? delta / 36e5 : // 1000 * 60 * 60
                units === 'day' ? (delta - zoneDelta) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                units === 'week' ? (delta - zoneDelta) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                delta;
        }
        return asFloat ? output : absFloor(output);
    }

    function monthDiff (a, b) {
        // difference in months
        var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
            // b is in (anchor - 1 month, anchor + 1 month)
            anchor = a.clone().add(wholeMonthDiff, 'months'),
            anchor2, adjust;

        if (b - anchor < 0) {
            anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor - anchor2);
        } else {
            anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
            // linear across the month
            adjust = (b - anchor) / (anchor2 - anchor);
        }

        return -(wholeMonthDiff + adjust);
    }

    utils_hooks__hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';

    function toString () {
        return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
    }

    function moment_format__toISOString () {
        var m = this.clone().utc();
        if (0 < m.year() && m.year() <= 9999) {
            if (isFunction(Date.prototype.toISOString)) {
                // native implementation is ~50x faster, use it when we can
                return this.toDate().toISOString();
            } else {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        } else {
            return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
        }
    }

    function format (inputString) {
        var output = formatMoment(this, inputString || utils_hooks__hooks.defaultFormat);
        return this.localeData().postformat(output);
    }

    function from (time, withoutSuffix) {
        if (this.isValid() &&
                ((isMoment(time) && time.isValid()) ||
                 local__createLocal(time).isValid())) {
            return create__createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
        } else {
            return this.localeData().invalidDate();
        }
    }

    function fromNow (withoutSuffix) {
        return this.from(local__createLocal(), withoutSuffix);
    }

    function to (time, withoutSuffix) {
        if (this.isValid() &&
                ((isMoment(time) && time.isValid()) ||
                 local__createLocal(time).isValid())) {
            return create__createDuration({from: this, to: time}).locale(this.locale()).humanize(!withoutSuffix);
        } else {
            return this.localeData().invalidDate();
        }
    }

    function toNow (withoutSuffix) {
        return this.to(local__createLocal(), withoutSuffix);
    }

    // If passed a locale key, it will set the locale for this
    // instance.  Otherwise, it will return the locale configuration
    // variables for this instance.
    function locale (key) {
        var newLocaleData;

        if (key === undefined) {
            return this._locale._abbr;
        } else {
            newLocaleData = locale_locales__getLocale(key);
            if (newLocaleData != null) {
                this._locale = newLocaleData;
            }
            return this;
        }
    }

    var lang = deprecate(
        'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
        function (key) {
            if (key === undefined) {
                return this.localeData();
            } else {
                return this.locale(key);
            }
        }
    );

    function localeData () {
        return this._locale;
    }

    function startOf (units) {
        units = normalizeUnits(units);
        // the following switch intentionally omits break keywords
        // to utilize falling through the cases.
        switch (units) {
        case 'year':
            this.month(0);
            /* falls through */
        case 'quarter':
        case 'month':
            this.date(1);
            /* falls through */
        case 'week':
        case 'isoWeek':
        case 'day':
            this.hours(0);
            /* falls through */
        case 'hour':
            this.minutes(0);
            /* falls through */
        case 'minute':
            this.seconds(0);
            /* falls through */
        case 'second':
            this.milliseconds(0);
        }

        // weeks are a special case
        if (units === 'week') {
            this.weekday(0);
        }
        if (units === 'isoWeek') {
            this.isoWeekday(1);
        }

        // quarters are also special
        if (units === 'quarter') {
            this.month(Math.floor(this.month() / 3) * 3);
        }

        return this;
    }

    function endOf (units) {
        units = normalizeUnits(units);
        if (units === undefined || units === 'millisecond') {
            return this;
        }
        return this.startOf(units).add(1, (units === 'isoWeek' ? 'week' : units)).subtract(1, 'ms');
    }

    function to_type__valueOf () {
        return +this._d - ((this._offset || 0) * 60000);
    }

    function unix () {
        return Math.floor(+this / 1000);
    }

    function toDate () {
        return this._offset ? new Date(+this) : this._d;
    }

    function toArray () {
        var m = this;
        return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
    }

    function toObject () {
        var m = this;
        return {
            years: m.year(),
            months: m.month(),
            date: m.date(),
            hours: m.hours(),
            minutes: m.minutes(),
            seconds: m.seconds(),
            milliseconds: m.milliseconds()
        };
    }

    function toJSON () {
        // JSON.stringify(new Date(NaN)) === 'null'
        return this.isValid() ? this.toISOString() : 'null';
    }

    function moment_valid__isValid () {
        return valid__isValid(this);
    }

    function parsingFlags () {
        return extend({}, getParsingFlags(this));
    }

    function invalidAt () {
        return getParsingFlags(this).overflow;
    }

    function creationData() {
        return {
            input: this._i,
            format: this._f,
            locale: this._locale,
            isUTC: this._isUTC,
            strict: this._strict
        };
    }

    // FORMATTING

    addFormatToken(0, ['gg', 2], 0, function () {
        return this.weekYear() % 100;
    });

    addFormatToken(0, ['GG', 2], 0, function () {
        return this.isoWeekYear() % 100;
    });

    function addWeekYearFormatToken (token, getter) {
        addFormatToken(0, [token, token.length], 0, getter);
    }

    addWeekYearFormatToken('gggg',     'weekYear');
    addWeekYearFormatToken('ggggg',    'weekYear');
    addWeekYearFormatToken('GGGG',  'isoWeekYear');
    addWeekYearFormatToken('GGGGG', 'isoWeekYear');

    // ALIASES

    addUnitAlias('weekYear', 'gg');
    addUnitAlias('isoWeekYear', 'GG');

    // PARSING

    addRegexToken('G',      matchSigned);
    addRegexToken('g',      matchSigned);
    addRegexToken('GG',     match1to2, match2);
    addRegexToken('gg',     match1to2, match2);
    addRegexToken('GGGG',   match1to4, match4);
    addRegexToken('gggg',   match1to4, match4);
    addRegexToken('GGGGG',  match1to6, match6);
    addRegexToken('ggggg',  match1to6, match6);

    addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
        week[token.substr(0, 2)] = toInt(input);
    });

    addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
        week[token] = utils_hooks__hooks.parseTwoDigitYear(input);
    });

    // MOMENTS

    function getSetWeekYear (input) {
        return getSetWeekYearHelper.call(this,
                input,
                this.week(),
                this.weekday(),
                this.localeData()._week.dow,
                this.localeData()._week.doy);
    }

    function getSetISOWeekYear (input) {
        return getSetWeekYearHelper.call(this,
                input, this.isoWeek(), this.isoWeekday(), 1, 4);
    }

    function getISOWeeksInYear () {
        return weeksInYear(this.year(), 1, 4);
    }

    function getWeeksInYear () {
        var weekInfo = this.localeData()._week;
        return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
    }

    function getSetWeekYearHelper(input, week, weekday, dow, doy) {
        var weeksTarget;
        if (input == null) {
            return weekOfYear(this, dow, doy).year;
        } else {
            weeksTarget = weeksInYear(input, dow, doy);
            if (week > weeksTarget) {
                week = weeksTarget;
            }
            return setWeekAll.call(this, input, week, weekday, dow, doy);
        }
    }

    function setWeekAll(weekYear, week, weekday, dow, doy) {
        var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
            date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

        // console.log("got", weekYear, week, weekday, "set", date.toISOString());
        this.year(date.getUTCFullYear());
        this.month(date.getUTCMonth());
        this.date(date.getUTCDate());
        return this;
    }

    // FORMATTING

    addFormatToken('Q', 0, 'Qo', 'quarter');

    // ALIASES

    addUnitAlias('quarter', 'Q');

    // PARSING

    addRegexToken('Q', match1);
    addParseToken('Q', function (input, array) {
        array[MONTH] = (toInt(input) - 1) * 3;
    });

    // MOMENTS

    function getSetQuarter (input) {
        return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
    }

    // FORMATTING

    addFormatToken('w', ['ww', 2], 'wo', 'week');
    addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

    // ALIASES

    addUnitAlias('week', 'w');
    addUnitAlias('isoWeek', 'W');

    // PARSING

    addRegexToken('w',  match1to2);
    addRegexToken('ww', match1to2, match2);
    addRegexToken('W',  match1to2);
    addRegexToken('WW', match1to2, match2);

    addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
        week[token.substr(0, 1)] = toInt(input);
    });

    // HELPERS

    // LOCALES

    function localeWeek (mom) {
        return weekOfYear(mom, this._week.dow, this._week.doy).week;
    }

    var defaultLocaleWeek = {
        dow : 0, // Sunday is the first day of the week.
        doy : 6  // The week that contains Jan 1st is the first week of the year.
    };

    function localeFirstDayOfWeek () {
        return this._week.dow;
    }

    function localeFirstDayOfYear () {
        return this._week.doy;
    }

    // MOMENTS

    function getSetWeek (input) {
        var week = this.localeData().week(this);
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    function getSetISOWeek (input) {
        var week = weekOfYear(this, 1, 4).week;
        return input == null ? week : this.add((input - week) * 7, 'd');
    }

    // FORMATTING

    addFormatToken('D', ['DD', 2], 'Do', 'date');

    // ALIASES

    addUnitAlias('date', 'D');

    // PARSING

    addRegexToken('D',  match1to2);
    addRegexToken('DD', match1to2, match2);
    addRegexToken('Do', function (isStrict, locale) {
        return isStrict ? locale._ordinalParse : locale._ordinalParseLenient;
    });

    addParseToken(['D', 'DD'], DATE);
    addParseToken('Do', function (input, array) {
        array[DATE] = toInt(input.match(match1to2)[0], 10);
    });

    // MOMENTS

    var getSetDayOfMonth = makeGetSet('Date', true);

    // FORMATTING

    addFormatToken('d', 0, 'do', 'day');

    addFormatToken('dd', 0, 0, function (format) {
        return this.localeData().weekdaysMin(this, format);
    });

    addFormatToken('ddd', 0, 0, function (format) {
        return this.localeData().weekdaysShort(this, format);
    });

    addFormatToken('dddd', 0, 0, function (format) {
        return this.localeData().weekdays(this, format);
    });

    addFormatToken('e', 0, 0, 'weekday');
    addFormatToken('E', 0, 0, 'isoWeekday');

    // ALIASES

    addUnitAlias('day', 'd');
    addUnitAlias('weekday', 'e');
    addUnitAlias('isoWeekday', 'E');

    // PARSING

    addRegexToken('d',    match1to2);
    addRegexToken('e',    match1to2);
    addRegexToken('E',    match1to2);
    addRegexToken('dd',   matchWord);
    addRegexToken('ddd',  matchWord);
    addRegexToken('dddd', matchWord);

    addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
        var weekday = config._locale.weekdaysParse(input, token, config._strict);
        // if we didn't get a weekday name, mark the date as invalid
        if (weekday != null) {
            week.d = weekday;
        } else {
            getParsingFlags(config).invalidWeekday = input;
        }
    });

    addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
        week[token] = toInt(input);
    });

    // HELPERS

    function parseWeekday(input, locale) {
        if (typeof input !== 'string') {
            return input;
        }

        if (!isNaN(input)) {
            return parseInt(input, 10);
        }

        input = locale.weekdaysParse(input);
        if (typeof input === 'number') {
            return input;
        }

        return null;
    }

    // LOCALES

    var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
    function localeWeekdays (m, format) {
        return isArray(this._weekdays) ? this._weekdays[m.day()] :
            this._weekdays[this._weekdays.isFormat.test(format) ? 'format' : 'standalone'][m.day()];
    }

    var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
    function localeWeekdaysShort (m) {
        return this._weekdaysShort[m.day()];
    }

    var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
    function localeWeekdaysMin (m) {
        return this._weekdaysMin[m.day()];
    }

    function localeWeekdaysParse (weekdayName, format, strict) {
        var i, mom, regex;

        if (!this._weekdaysParse) {
            this._weekdaysParse = [];
            this._minWeekdaysParse = [];
            this._shortWeekdaysParse = [];
            this._fullWeekdaysParse = [];
        }

        for (i = 0; i < 7; i++) {
            // make the regex if we don't have it already

            mom = local__createLocal([2000, 1]).day(i);
            if (strict && !this._fullWeekdaysParse[i]) {
                this._fullWeekdaysParse[i] = new RegExp('^' + this.weekdays(mom, '').replace('.', '\.?') + '$', 'i');
                this._shortWeekdaysParse[i] = new RegExp('^' + this.weekdaysShort(mom, '').replace('.', '\.?') + '$', 'i');
                this._minWeekdaysParse[i] = new RegExp('^' + this.weekdaysMin(mom, '').replace('.', '\.?') + '$', 'i');
            }
            if (!this._weekdaysParse[i]) {
                regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
            }
            // test the regex
            if (strict && format === 'dddd' && this._fullWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (strict && format === 'ddd' && this._shortWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (strict && format === 'dd' && this._minWeekdaysParse[i].test(weekdayName)) {
                return i;
            } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
                return i;
            }
        }
    }

    // MOMENTS

    function getSetDayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
        if (input != null) {
            input = parseWeekday(input, this.localeData());
            return this.add(input - day, 'd');
        } else {
            return day;
        }
    }

    function getSetLocaleDayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
        return input == null ? weekday : this.add(input - weekday, 'd');
    }

    function getSetISODayOfWeek (input) {
        if (!this.isValid()) {
            return input != null ? this : NaN;
        }
        // behaves the same as moment#day except
        // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
        // as a setter, sunday should belong to the previous week.
        return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
    }

    // FORMATTING

    addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

    // ALIASES

    addUnitAlias('dayOfYear', 'DDD');

    // PARSING

    addRegexToken('DDD',  match1to3);
    addRegexToken('DDDD', match3);
    addParseToken(['DDD', 'DDDD'], function (input, array, config) {
        config._dayOfYear = toInt(input);
    });

    // HELPERS

    // MOMENTS

    function getSetDayOfYear (input) {
        var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
        return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
    }

    // FORMATTING

    function hFormat() {
        return this.hours() % 12 || 12;
    }

    addFormatToken('H', ['HH', 2], 0, 'hour');
    addFormatToken('h', ['hh', 2], 0, hFormat);

    addFormatToken('hmm', 0, 0, function () {
        return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
    });

    addFormatToken('hmmss', 0, 0, function () {
        return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2) +
            zeroFill(this.seconds(), 2);
    });

    addFormatToken('Hmm', 0, 0, function () {
        return '' + this.hours() + zeroFill(this.minutes(), 2);
    });

    addFormatToken('Hmmss', 0, 0, function () {
        return '' + this.hours() + zeroFill(this.minutes(), 2) +
            zeroFill(this.seconds(), 2);
    });

    function meridiem (token, lowercase) {
        addFormatToken(token, 0, 0, function () {
            return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
        });
    }

    meridiem('a', true);
    meridiem('A', false);

    // ALIASES

    addUnitAlias('hour', 'h');

    // PARSING

    function matchMeridiem (isStrict, locale) {
        return locale._meridiemParse;
    }

    addRegexToken('a',  matchMeridiem);
    addRegexToken('A',  matchMeridiem);
    addRegexToken('H',  match1to2);
    addRegexToken('h',  match1to2);
    addRegexToken('HH', match1to2, match2);
    addRegexToken('hh', match1to2, match2);

    addRegexToken('hmm', match3to4);
    addRegexToken('hmmss', match5to6);
    addRegexToken('Hmm', match3to4);
    addRegexToken('Hmmss', match5to6);

    addParseToken(['H', 'HH'], HOUR);
    addParseToken(['a', 'A'], function (input, array, config) {
        config._isPm = config._locale.isPM(input);
        config._meridiem = input;
    });
    addParseToken(['h', 'hh'], function (input, array, config) {
        array[HOUR] = toInt(input);
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('hmm', function (input, array, config) {
        var pos = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos));
        array[MINUTE] = toInt(input.substr(pos));
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('hmmss', function (input, array, config) {
        var pos1 = input.length - 4;
        var pos2 = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos1));
        array[MINUTE] = toInt(input.substr(pos1, 2));
        array[SECOND] = toInt(input.substr(pos2));
        getParsingFlags(config).bigHour = true;
    });
    addParseToken('Hmm', function (input, array, config) {
        var pos = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos));
        array[MINUTE] = toInt(input.substr(pos));
    });
    addParseToken('Hmmss', function (input, array, config) {
        var pos1 = input.length - 4;
        var pos2 = input.length - 2;
        array[HOUR] = toInt(input.substr(0, pos1));
        array[MINUTE] = toInt(input.substr(pos1, 2));
        array[SECOND] = toInt(input.substr(pos2));
    });

    // LOCALES

    function localeIsPM (input) {
        // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
        // Using charAt should be more compatible.
        return ((input + '').toLowerCase().charAt(0) === 'p');
    }

    var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
    function localeMeridiem (hours, minutes, isLower) {
        if (hours > 11) {
            return isLower ? 'pm' : 'PM';
        } else {
            return isLower ? 'am' : 'AM';
        }
    }


    // MOMENTS

    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    var getSetHour = makeGetSet('Hours', true);

    // FORMATTING

    addFormatToken('m', ['mm', 2], 0, 'minute');

    // ALIASES

    addUnitAlias('minute', 'm');

    // PARSING

    addRegexToken('m',  match1to2);
    addRegexToken('mm', match1to2, match2);
    addParseToken(['m', 'mm'], MINUTE);

    // MOMENTS

    var getSetMinute = makeGetSet('Minutes', false);

    // FORMATTING

    addFormatToken('s', ['ss', 2], 0, 'second');

    // ALIASES

    addUnitAlias('second', 's');

    // PARSING

    addRegexToken('s',  match1to2);
    addRegexToken('ss', match1to2, match2);
    addParseToken(['s', 'ss'], SECOND);

    // MOMENTS

    var getSetSecond = makeGetSet('Seconds', false);

    // FORMATTING

    addFormatToken('S', 0, 0, function () {
        return ~~(this.millisecond() / 100);
    });

    addFormatToken(0, ['SS', 2], 0, function () {
        return ~~(this.millisecond() / 10);
    });

    addFormatToken(0, ['SSS', 3], 0, 'millisecond');
    addFormatToken(0, ['SSSS', 4], 0, function () {
        return this.millisecond() * 10;
    });
    addFormatToken(0, ['SSSSS', 5], 0, function () {
        return this.millisecond() * 100;
    });
    addFormatToken(0, ['SSSSSS', 6], 0, function () {
        return this.millisecond() * 1000;
    });
    addFormatToken(0, ['SSSSSSS', 7], 0, function () {
        return this.millisecond() * 10000;
    });
    addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
        return this.millisecond() * 100000;
    });
    addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
        return this.millisecond() * 1000000;
    });


    // ALIASES

    addUnitAlias('millisecond', 'ms');

    // PARSING

    addRegexToken('S',    match1to3, match1);
    addRegexToken('SS',   match1to3, match2);
    addRegexToken('SSS',  match1to3, match3);

    var token;
    for (token = 'SSSS'; token.length <= 9; token += 'S') {
        addRegexToken(token, matchUnsigned);
    }

    function parseMs(input, array) {
        array[MILLISECOND] = toInt(('0.' + input) * 1000);
    }

    for (token = 'S'; token.length <= 9; token += 'S') {
        addParseToken(token, parseMs);
    }
    // MOMENTS

    var getSetMillisecond = makeGetSet('Milliseconds', false);

    // FORMATTING

    addFormatToken('z',  0, 0, 'zoneAbbr');
    addFormatToken('zz', 0, 0, 'zoneName');

    // MOMENTS

    function getZoneAbbr () {
        return this._isUTC ? 'UTC' : '';
    }

    function getZoneName () {
        return this._isUTC ? 'Coordinated Universal Time' : '';
    }

    var momentPrototype__proto = Moment.prototype;

    momentPrototype__proto.add               = add_subtract__add;
    momentPrototype__proto.calendar          = moment_calendar__calendar;
    momentPrototype__proto.clone             = clone;
    momentPrototype__proto.diff              = diff;
    momentPrototype__proto.endOf             = endOf;
    momentPrototype__proto.format            = format;
    momentPrototype__proto.from              = from;
    momentPrototype__proto.fromNow           = fromNow;
    momentPrototype__proto.to                = to;
    momentPrototype__proto.toNow             = toNow;
    momentPrototype__proto.get               = getSet;
    momentPrototype__proto.invalidAt         = invalidAt;
    momentPrototype__proto.isAfter           = isAfter;
    momentPrototype__proto.isBefore          = isBefore;
    momentPrototype__proto.isBetween         = isBetween;
    momentPrototype__proto.isSame            = isSame;
    momentPrototype__proto.isSameOrAfter     = isSameOrAfter;
    momentPrototype__proto.isSameOrBefore    = isSameOrBefore;
    momentPrototype__proto.isValid           = moment_valid__isValid;
    momentPrototype__proto.lang              = lang;
    momentPrototype__proto.locale            = locale;
    momentPrototype__proto.localeData        = localeData;
    momentPrototype__proto.max               = prototypeMax;
    momentPrototype__proto.min               = prototypeMin;
    momentPrototype__proto.parsingFlags      = parsingFlags;
    momentPrototype__proto.set               = getSet;
    momentPrototype__proto.startOf           = startOf;
    momentPrototype__proto.subtract          = add_subtract__subtract;
    momentPrototype__proto.toArray           = toArray;
    momentPrototype__proto.toObject          = toObject;
    momentPrototype__proto.toDate            = toDate;
    momentPrototype__proto.toISOString       = moment_format__toISOString;
    momentPrototype__proto.toJSON            = toJSON;
    momentPrototype__proto.toString          = toString;
    momentPrototype__proto.unix              = unix;
    momentPrototype__proto.valueOf           = to_type__valueOf;
    momentPrototype__proto.creationData      = creationData;

    // Year
    momentPrototype__proto.year       = getSetYear;
    momentPrototype__proto.isLeapYear = getIsLeapYear;

    // Week Year
    momentPrototype__proto.weekYear    = getSetWeekYear;
    momentPrototype__proto.isoWeekYear = getSetISOWeekYear;

    // Quarter
    momentPrototype__proto.quarter = momentPrototype__proto.quarters = getSetQuarter;

    // Month
    momentPrototype__proto.month       = getSetMonth;
    momentPrototype__proto.daysInMonth = getDaysInMonth;

    // Week
    momentPrototype__proto.week           = momentPrototype__proto.weeks        = getSetWeek;
    momentPrototype__proto.isoWeek        = momentPrototype__proto.isoWeeks     = getSetISOWeek;
    momentPrototype__proto.weeksInYear    = getWeeksInYear;
    momentPrototype__proto.isoWeeksInYear = getISOWeeksInYear;

    // Day
    momentPrototype__proto.date       = getSetDayOfMonth;
    momentPrototype__proto.day        = momentPrototype__proto.days             = getSetDayOfWeek;
    momentPrototype__proto.weekday    = getSetLocaleDayOfWeek;
    momentPrototype__proto.isoWeekday = getSetISODayOfWeek;
    momentPrototype__proto.dayOfYear  = getSetDayOfYear;

    // Hour
    momentPrototype__proto.hour = momentPrototype__proto.hours = getSetHour;

    // Minute
    momentPrototype__proto.minute = momentPrototype__proto.minutes = getSetMinute;

    // Second
    momentPrototype__proto.second = momentPrototype__proto.seconds = getSetSecond;

    // Millisecond
    momentPrototype__proto.millisecond = momentPrototype__proto.milliseconds = getSetMillisecond;

    // Offset
    momentPrototype__proto.utcOffset            = getSetOffset;
    momentPrototype__proto.utc                  = setOffsetToUTC;
    momentPrototype__proto.local                = setOffsetToLocal;
    momentPrototype__proto.parseZone            = setOffsetToParsedOffset;
    momentPrototype__proto.hasAlignedHourOffset = hasAlignedHourOffset;
    momentPrototype__proto.isDST                = isDaylightSavingTime;
    momentPrototype__proto.isDSTShifted         = isDaylightSavingTimeShifted;
    momentPrototype__proto.isLocal              = isLocal;
    momentPrototype__proto.isUtcOffset          = isUtcOffset;
    momentPrototype__proto.isUtc                = isUtc;
    momentPrototype__proto.isUTC                = isUtc;

    // Timezone
    momentPrototype__proto.zoneAbbr = getZoneAbbr;
    momentPrototype__proto.zoneName = getZoneName;

    // Deprecations
    momentPrototype__proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
    momentPrototype__proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
    momentPrototype__proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
    momentPrototype__proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. https://github.com/moment/moment/issues/1779', getSetZone);

    var momentPrototype = momentPrototype__proto;

    function moment__createUnix (input) {
        return local__createLocal(input * 1000);
    }

    function moment__createInZone () {
        return local__createLocal.apply(null, arguments).parseZone();
    }

    var defaultCalendar = {
        sameDay : '[Today at] LT',
        nextDay : '[Tomorrow at] LT',
        nextWeek : 'dddd [at] LT',
        lastDay : '[Yesterday at] LT',
        lastWeek : '[Last] dddd [at] LT',
        sameElse : 'L'
    };

    function locale_calendar__calendar (key, mom, now) {
        var output = this._calendar[key];
        return isFunction(output) ? output.call(mom, now) : output;
    }

    var defaultLongDateFormat = {
        LTS  : 'h:mm:ss A',
        LT   : 'h:mm A',
        L    : 'MM/DD/YYYY',
        LL   : 'MMMM D, YYYY',
        LLL  : 'MMMM D, YYYY h:mm A',
        LLLL : 'dddd, MMMM D, YYYY h:mm A'
    };

    function longDateFormat (key) {
        var format = this._longDateFormat[key],
            formatUpper = this._longDateFormat[key.toUpperCase()];

        if (format || !formatUpper) {
            return format;
        }

        this._longDateFormat[key] = formatUpper.replace(/MMMM|MM|DD|dddd/g, function (val) {
            return val.slice(1);
        });

        return this._longDateFormat[key];
    }

    var defaultInvalidDate = 'Invalid date';

    function invalidDate () {
        return this._invalidDate;
    }

    var defaultOrdinal = '%d';
    var defaultOrdinalParse = /\d{1,2}/;

    function ordinal (number) {
        return this._ordinal.replace('%d', number);
    }

    function preParsePostFormat (string) {
        return string;
    }

    var defaultRelativeTime = {
        future : 'in %s',
        past   : '%s ago',
        s  : 'a few seconds',
        m  : 'a minute',
        mm : '%d minutes',
        h  : 'an hour',
        hh : '%d hours',
        d  : 'a day',
        dd : '%d days',
        M  : 'a month',
        MM : '%d months',
        y  : 'a year',
        yy : '%d years'
    };

    function relative__relativeTime (number, withoutSuffix, string, isFuture) {
        var output = this._relativeTime[string];
        return (isFunction(output)) ?
            output(number, withoutSuffix, string, isFuture) :
            output.replace(/%d/i, number);
    }

    function pastFuture (diff, output) {
        var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
        return isFunction(format) ? format(output) : format.replace(/%s/i, output);
    }

    function locale_set__set (config) {
        var prop, i;
        for (i in config) {
            prop = config[i];
            if (isFunction(prop)) {
                this[i] = prop;
            } else {
                this['_' + i] = prop;
            }
        }
        // Lenient ordinal parsing accepts just a number in addition to
        // number + (possibly) stuff coming from _ordinalParseLenient.
        this._ordinalParseLenient = new RegExp(this._ordinalParse.source + '|' + (/\d{1,2}/).source);
    }

    var prototype__proto = Locale.prototype;

    prototype__proto._calendar       = defaultCalendar;
    prototype__proto.calendar        = locale_calendar__calendar;
    prototype__proto._longDateFormat = defaultLongDateFormat;
    prototype__proto.longDateFormat  = longDateFormat;
    prototype__proto._invalidDate    = defaultInvalidDate;
    prototype__proto.invalidDate     = invalidDate;
    prototype__proto._ordinal        = defaultOrdinal;
    prototype__proto.ordinal         = ordinal;
    prototype__proto._ordinalParse   = defaultOrdinalParse;
    prototype__proto.preparse        = preParsePostFormat;
    prototype__proto.postformat      = preParsePostFormat;
    prototype__proto._relativeTime   = defaultRelativeTime;
    prototype__proto.relativeTime    = relative__relativeTime;
    prototype__proto.pastFuture      = pastFuture;
    prototype__proto.set             = locale_set__set;

    // Month
    prototype__proto.months       =        localeMonths;
    prototype__proto._months      = defaultLocaleMonths;
    prototype__proto.monthsShort  =        localeMonthsShort;
    prototype__proto._monthsShort = defaultLocaleMonthsShort;
    prototype__proto.monthsParse  =        localeMonthsParse;

    // Week
    prototype__proto.week = localeWeek;
    prototype__proto._week = defaultLocaleWeek;
    prototype__proto.firstDayOfYear = localeFirstDayOfYear;
    prototype__proto.firstDayOfWeek = localeFirstDayOfWeek;

    // Day of Week
    prototype__proto.weekdays       =        localeWeekdays;
    prototype__proto._weekdays      = defaultLocaleWeekdays;
    prototype__proto.weekdaysMin    =        localeWeekdaysMin;
    prototype__proto._weekdaysMin   = defaultLocaleWeekdaysMin;
    prototype__proto.weekdaysShort  =        localeWeekdaysShort;
    prototype__proto._weekdaysShort = defaultLocaleWeekdaysShort;
    prototype__proto.weekdaysParse  =        localeWeekdaysParse;

    // Hours
    prototype__proto.isPM = localeIsPM;
    prototype__proto._meridiemParse = defaultLocaleMeridiemParse;
    prototype__proto.meridiem = localeMeridiem;

    function lists__get (format, index, field, setter) {
        var locale = locale_locales__getLocale();
        var utc = create_utc__createUTC().set(setter, index);
        return locale[field](utc, format);
    }

    function list (format, index, field, count, setter) {
        if (typeof format === 'number') {
            index = format;
            format = undefined;
        }

        format = format || '';

        if (index != null) {
            return lists__get(format, index, field, setter);
        }

        var i;
        var out = [];
        for (i = 0; i < count; i++) {
            out[i] = lists__get(format, i, field, setter);
        }
        return out;
    }

    function lists__listMonths (format, index) {
        return list(format, index, 'months', 12, 'month');
    }

    function lists__listMonthsShort (format, index) {
        return list(format, index, 'monthsShort', 12, 'month');
    }

    function lists__listWeekdays (format, index) {
        return list(format, index, 'weekdays', 7, 'day');
    }

    function lists__listWeekdaysShort (format, index) {
        return list(format, index, 'weekdaysShort', 7, 'day');
    }

    function lists__listWeekdaysMin (format, index) {
        return list(format, index, 'weekdaysMin', 7, 'day');
    }

    locale_locales__getSetGlobalLocale('en', {
        monthsParse : [/^jan/i, /^feb/i, /^mar/i, /^apr/i, /^may/i, /^jun/i, /^jul/i, /^aug/i, /^sep/i, /^oct/i, /^nov/i, /^dec/i],
        longMonthsParse : [/^january$/i, /^february$/i, /^march$/i, /^april$/i, /^may$/i, /^june$/i, /^july$/i, /^august$/i, /^september$/i, /^october$/i, /^november$/i, /^december$/i],
        shortMonthsParse : [/^jan$/i, /^feb$/i, /^mar$/i, /^apr$/i, /^may$/i, /^jun$/i, /^jul$/i, /^aug/i, /^sept?$/i, /^oct$/i, /^nov$/i, /^dec$/i],
        ordinalParse: /\d{1,2}(th|st|nd|rd)/,
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    // Side effect imports
    utils_hooks__hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', locale_locales__getSetGlobalLocale);
    utils_hooks__hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', locale_locales__getLocale);

    var mathAbs = Math.abs;

    function duration_abs__abs () {
        var data           = this._data;

        this._milliseconds = mathAbs(this._milliseconds);
        this._days         = mathAbs(this._days);
        this._months       = mathAbs(this._months);

        data.milliseconds  = mathAbs(data.milliseconds);
        data.seconds       = mathAbs(data.seconds);
        data.minutes       = mathAbs(data.minutes);
        data.hours         = mathAbs(data.hours);
        data.months        = mathAbs(data.months);
        data.years         = mathAbs(data.years);

        return this;
    }

    function duration_add_subtract__addSubtract (duration, input, value, direction) {
        var other = create__createDuration(input, value);

        duration._milliseconds += direction * other._milliseconds;
        duration._days         += direction * other._days;
        duration._months       += direction * other._months;

        return duration._bubble();
    }

    // supports only 2.0-style add(1, 's') or add(duration)
    function duration_add_subtract__add (input, value) {
        return duration_add_subtract__addSubtract(this, input, value, 1);
    }

    // supports only 2.0-style subtract(1, 's') or subtract(duration)
    function duration_add_subtract__subtract (input, value) {
        return duration_add_subtract__addSubtract(this, input, value, -1);
    }

    function absCeil (number) {
        if (number < 0) {
            return Math.floor(number);
        } else {
            return Math.ceil(number);
        }
    }

    function bubble () {
        var milliseconds = this._milliseconds;
        var days         = this._days;
        var months       = this._months;
        var data         = this._data;
        var seconds, minutes, hours, years, monthsFromDays;

        // if we have a mix of positive and negative values, bubble down first
        // check: https://github.com/moment/moment/issues/2166
        if (!((milliseconds >= 0 && days >= 0 && months >= 0) ||
                (milliseconds <= 0 && days <= 0 && months <= 0))) {
            milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
            days = 0;
            months = 0;
        }

        // The following code bubbles up values, see the tests for
        // examples of what that means.
        data.milliseconds = milliseconds % 1000;

        seconds           = absFloor(milliseconds / 1000);
        data.seconds      = seconds % 60;

        minutes           = absFloor(seconds / 60);
        data.minutes      = minutes % 60;

        hours             = absFloor(minutes / 60);
        data.hours        = hours % 24;

        days += absFloor(hours / 24);

        // convert days to months
        monthsFromDays = absFloor(daysToMonths(days));
        months += monthsFromDays;
        days -= absCeil(monthsToDays(monthsFromDays));

        // 12 months -> 1 year
        years = absFloor(months / 12);
        months %= 12;

        data.days   = days;
        data.months = months;
        data.years  = years;

        return this;
    }

    function daysToMonths (days) {
        // 400 years have 146097 days (taking into account leap year rules)
        // 400 years have 12 months === 4800
        return days * 4800 / 146097;
    }

    function monthsToDays (months) {
        // the reverse of daysToMonths
        return months * 146097 / 4800;
    }

    function as (units) {
        var days;
        var months;
        var milliseconds = this._milliseconds;

        units = normalizeUnits(units);

        if (units === 'month' || units === 'year') {
            days   = this._days   + milliseconds / 864e5;
            months = this._months + daysToMonths(days);
            return units === 'month' ? months : months / 12;
        } else {
            // handle milliseconds separately because of floating point math errors (issue #1867)
            days = this._days + Math.round(monthsToDays(this._months));
            switch (units) {
                case 'week'   : return days / 7     + milliseconds / 6048e5;
                case 'day'    : return days         + milliseconds / 864e5;
                case 'hour'   : return days * 24    + milliseconds / 36e5;
                case 'minute' : return days * 1440  + milliseconds / 6e4;
                case 'second' : return days * 86400 + milliseconds / 1000;
                // Math.floor prevents floating point math errors here
                case 'millisecond': return Math.floor(days * 864e5) + milliseconds;
                default: throw new Error('Unknown unit ' + units);
            }
        }
    }

    // TODO: Use this.as('ms')?
    function duration_as__valueOf () {
        return (
            this._milliseconds +
            this._days * 864e5 +
            (this._months % 12) * 2592e6 +
            toInt(this._months / 12) * 31536e6
        );
    }

    function makeAs (alias) {
        return function () {
            return this.as(alias);
        };
    }

    var asMilliseconds = makeAs('ms');
    var asSeconds      = makeAs('s');
    var asMinutes      = makeAs('m');
    var asHours        = makeAs('h');
    var asDays         = makeAs('d');
    var asWeeks        = makeAs('w');
    var asMonths       = makeAs('M');
    var asYears        = makeAs('y');

    function duration_get__get (units) {
        units = normalizeUnits(units);
        return this[units + 's']();
    }

    function makeGetter(name) {
        return function () {
            return this._data[name];
        };
    }

    var milliseconds = makeGetter('milliseconds');
    var seconds      = makeGetter('seconds');
    var minutes      = makeGetter('minutes');
    var hours        = makeGetter('hours');
    var days         = makeGetter('days');
    var months       = makeGetter('months');
    var years        = makeGetter('years');

    function weeks () {
        return absFloor(this.days() / 7);
    }

    var round = Math.round;
    var thresholds = {
        s: 45,  // seconds to minute
        m: 45,  // minutes to hour
        h: 22,  // hours to day
        d: 26,  // days to month
        M: 11   // months to year
    };

    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
        return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function duration_humanize__relativeTime (posNegDuration, withoutSuffix, locale) {
        var duration = create__createDuration(posNegDuration).abs();
        var seconds  = round(duration.as('s'));
        var minutes  = round(duration.as('m'));
        var hours    = round(duration.as('h'));
        var days     = round(duration.as('d'));
        var months   = round(duration.as('M'));
        var years    = round(duration.as('y'));

        var a = seconds < thresholds.s && ['s', seconds]  ||
                minutes <= 1           && ['m']           ||
                minutes < thresholds.m && ['mm', minutes] ||
                hours   <= 1           && ['h']           ||
                hours   < thresholds.h && ['hh', hours]   ||
                days    <= 1           && ['d']           ||
                days    < thresholds.d && ['dd', days]    ||
                months  <= 1           && ['M']           ||
                months  < thresholds.M && ['MM', months]  ||
                years   <= 1           && ['y']           || ['yy', years];

        a[2] = withoutSuffix;
        a[3] = +posNegDuration > 0;
        a[4] = locale;
        return substituteTimeAgo.apply(null, a);
    }

    // This function allows you to set a threshold for relative time strings
    function duration_humanize__getSetRelativeTimeThreshold (threshold, limit) {
        if (thresholds[threshold] === undefined) {
            return false;
        }
        if (limit === undefined) {
            return thresholds[threshold];
        }
        thresholds[threshold] = limit;
        return true;
    }

    function humanize (withSuffix) {
        var locale = this.localeData();
        var output = duration_humanize__relativeTime(this, !withSuffix, locale);

        if (withSuffix) {
            output = locale.pastFuture(+this, output);
        }

        return locale.postformat(output);
    }

    var iso_string__abs = Math.abs;

    function iso_string__toISOString() {
        // for ISO strings we do not use the normal bubbling rules:
        //  * milliseconds bubble up until they become hours
        //  * days do not bubble at all
        //  * months bubble up until they become years
        // This is because there is no context-free conversion between hours and days
        // (think of clock changes)
        // and also not between days and months (28-31 days per month)
        var seconds = iso_string__abs(this._milliseconds) / 1000;
        var days         = iso_string__abs(this._days);
        var months       = iso_string__abs(this._months);
        var minutes, hours, years;

        // 3600 seconds -> 60 minutes -> 1 hour
        minutes           = absFloor(seconds / 60);
        hours             = absFloor(minutes / 60);
        seconds %= 60;
        minutes %= 60;

        // 12 months -> 1 year
        years  = absFloor(months / 12);
        months %= 12;


        // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
        var Y = years;
        var M = months;
        var D = days;
        var h = hours;
        var m = minutes;
        var s = seconds;
        var total = this.asSeconds();

        if (!total) {
            // this is the same as C#'s (Noda) and python (isodate)...
            // but not other JS (goog.date)
            return 'P0D';
        }

        return (total < 0 ? '-' : '') +
            'P' +
            (Y ? Y + 'Y' : '') +
            (M ? M + 'M' : '') +
            (D ? D + 'D' : '') +
            ((h || m || s) ? 'T' : '') +
            (h ? h + 'H' : '') +
            (m ? m + 'M' : '') +
            (s ? s + 'S' : '');
    }

    var duration_prototype__proto = Duration.prototype;

    duration_prototype__proto.abs            = duration_abs__abs;
    duration_prototype__proto.add            = duration_add_subtract__add;
    duration_prototype__proto.subtract       = duration_add_subtract__subtract;
    duration_prototype__proto.as             = as;
    duration_prototype__proto.asMilliseconds = asMilliseconds;
    duration_prototype__proto.asSeconds      = asSeconds;
    duration_prototype__proto.asMinutes      = asMinutes;
    duration_prototype__proto.asHours        = asHours;
    duration_prototype__proto.asDays         = asDays;
    duration_prototype__proto.asWeeks        = asWeeks;
    duration_prototype__proto.asMonths       = asMonths;
    duration_prototype__proto.asYears        = asYears;
    duration_prototype__proto.valueOf        = duration_as__valueOf;
    duration_prototype__proto._bubble        = bubble;
    duration_prototype__proto.get            = duration_get__get;
    duration_prototype__proto.milliseconds   = milliseconds;
    duration_prototype__proto.seconds        = seconds;
    duration_prototype__proto.minutes        = minutes;
    duration_prototype__proto.hours          = hours;
    duration_prototype__proto.days           = days;
    duration_prototype__proto.weeks          = weeks;
    duration_prototype__proto.months         = months;
    duration_prototype__proto.years          = years;
    duration_prototype__proto.humanize       = humanize;
    duration_prototype__proto.toISOString    = iso_string__toISOString;
    duration_prototype__proto.toString       = iso_string__toISOString;
    duration_prototype__proto.toJSON         = iso_string__toISOString;
    duration_prototype__proto.locale         = locale;
    duration_prototype__proto.localeData     = localeData;

    // Deprecations
    duration_prototype__proto.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', iso_string__toISOString);
    duration_prototype__proto.lang = lang;

    // Side effect imports

    // FORMATTING

    addFormatToken('X', 0, 0, 'unix');
    addFormatToken('x', 0, 0, 'valueOf');

    // PARSING

    addRegexToken('x', matchSigned);
    addRegexToken('X', matchTimestamp);
    addParseToken('X', function (input, array, config) {
        config._d = new Date(parseFloat(input, 10) * 1000);
    });
    addParseToken('x', function (input, array, config) {
        config._d = new Date(toInt(input));
    });

    // Side effect imports


    utils_hooks__hooks.version = '2.11.0';

    setHookCallback(local__createLocal);

    utils_hooks__hooks.fn                    = momentPrototype;
    utils_hooks__hooks.min                   = min;
    utils_hooks__hooks.max                   = max;
    utils_hooks__hooks.now                   = now;
    utils_hooks__hooks.utc                   = create_utc__createUTC;
    utils_hooks__hooks.unix                  = moment__createUnix;
    utils_hooks__hooks.months                = lists__listMonths;
    utils_hooks__hooks.isDate                = isDate;
    utils_hooks__hooks.locale                = locale_locales__getSetGlobalLocale;
    utils_hooks__hooks.invalid               = valid__createInvalid;
    utils_hooks__hooks.duration              = create__createDuration;
    utils_hooks__hooks.isMoment              = isMoment;
    utils_hooks__hooks.weekdays              = lists__listWeekdays;
    utils_hooks__hooks.parseZone             = moment__createInZone;
    utils_hooks__hooks.localeData            = locale_locales__getLocale;
    utils_hooks__hooks.isDuration            = isDuration;
    utils_hooks__hooks.monthsShort           = lists__listMonthsShort;
    utils_hooks__hooks.weekdaysMin           = lists__listWeekdaysMin;
    utils_hooks__hooks.defineLocale          = defineLocale;
    utils_hooks__hooks.weekdaysShort         = lists__listWeekdaysShort;
    utils_hooks__hooks.normalizeUnits        = normalizeUnits;
    utils_hooks__hooks.relativeTimeThreshold = duration_humanize__getSetRelativeTimeThreshold;
    utils_hooks__hooks.prototype             = momentPrototype;

    var _moment = utils_hooks__hooks;

    return _moment;

}));
},{}],78:[function(require,module,exports){
'use strict';

(function (factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    window.propagating = factory();
  }
}(function () {
  var _firstTarget = null; // singleton, will contain the target element where the touch event started
  var _processing = false; // singleton, true when a touch event is being handled

  /**
   * Extend an Hammer.js instance with event propagation.
   *
   * Features:
   * - Events emitted by hammer will propagate in order from child to parent
   *   elements.
   * - Events are extended with a function `event.stopPropagation()` to stop
   *   propagation to parent elements.
   * - An option `preventDefault` to stop all default browser behavior.
   *
   * Usage:
   *   var hammer = propagatingHammer(new Hammer(element));
   *   var hammer = propagatingHammer(new Hammer(element), {preventDefault: true});
   *
   * @param {Hammer.Manager} hammer   An hammer instance.
   * @param {Object} [options]        Available options:
   *                                  - `preventDefault: true | 'mouse' | 'touch' | 'pen'`.
   *                                    Enforce preventing the default browser behavior.
   *                                    Cannot be set to `false`.
   * @return {Hammer.Manager} Returns the same hammer instance with extended
   *                          functionality
   */
  return function propagating(hammer, options) {
    var _options = options || {
      preventDefault: false
    };

    if (hammer.Manager) {
      // This looks like the Hammer constructor.
      // Overload the constructors with our own.
      var Hammer = hammer;

      var PropagatingHammer = function(element, options) {
        var o = Object.create(_options);
        if (options) Hammer.assign(o, options);
        return propagating(new Hammer(element, o), o);
      };
      Hammer.assign(PropagatingHammer, Hammer);

      PropagatingHammer.Manager = function (element, options) {
        var o = Object.create(_options);
        if (options) Hammer.assign(o, options);
        return propagating(new Hammer.Manager(element, o), o);
      };

      return PropagatingHammer;
    }

    // create a wrapper object which will override the functions
    // `on`, `off`, `destroy`, and `emit` of the hammer instance
    var wrapper = Object.create(hammer);

    // attach to DOM element
    var element = hammer.element;

    if(!element.hammer) element.hammer = [];
    element.hammer.push(wrapper);

    // register an event to catch the start of a gesture and store the
    // target in a singleton
    hammer.on('hammer.input', function (event) {
      if (_options.preventDefault === true || (_options.preventDefault === event.pointerType)) {
        event.preventDefault();
      }
      if (event.isFirst) {
        _firstTarget = event.target;
      }
    });

    /** @type {Object.<String, Array.<function>>} */
    wrapper._handlers = {};

    /**
     * Register a handler for one or multiple events
     * @param {String} events    A space separated string with events
     * @param {function} handler A callback function, called as handler(event)
     * @returns {Hammer.Manager} Returns the hammer instance
     */
    wrapper.on = function (events, handler) {
      // register the handler
      split(events).forEach(function (event) {
        var _handlers = wrapper._handlers[event];
        if (!_handlers) {
          wrapper._handlers[event] = _handlers = [];

          // register the static, propagated handler
          hammer.on(event, propagatedHandler);
        }
        _handlers.push(handler);
      });

      return wrapper;
    };

    /**
     * Unregister a handler for one or multiple events
     * @param {String} events      A space separated string with events
     * @param {function} [handler] Optional. The registered handler. If not
     *                             provided, all handlers for given events
     *                             are removed.
     * @returns {Hammer.Manager}   Returns the hammer instance
     */
    wrapper.off = function (events, handler) {
      // unregister the handler
      split(events).forEach(function (event) {
        var _handlers = wrapper._handlers[event];
        if (_handlers) {
          _handlers = handler ? _handlers.filter(function (h) {
            return h !== handler;
          }) : [];

          if (_handlers.length > 0) {
            wrapper._handlers[event] = _handlers;
          }
          else {
            // remove static, propagated handler
            hammer.off(event, propagatedHandler);
            delete wrapper._handlers[event];
          }
        }
      });

      return wrapper;
    };

    /**
     * Emit to the event listeners
     * @param {string} eventType
     * @param {Event} event
     */
    wrapper.emit = function(eventType, event) {
      _firstTarget = event.target;
      hammer.emit(eventType, event);
    };

    wrapper.destroy = function () {
      // Detach from DOM element
      var hammers = hammer.element.hammer;
      var idx = hammers.indexOf(wrapper);
      if(idx !== -1) hammers.splice(idx,1);
      if(!hammers.length) delete hammer.element.hammer;

      // clear all handlers
      wrapper._handlers = {};

      // call original hammer destroy
      hammer.destroy();
    };

    // split a string with space separated words
    function split(events) {
      return events.match(/[^ ]+/g);
    }

    /**
     * A static event handler, applying event propagation.
     * @param {Object} event
     */
    function propagatedHandler(event) {
      // let only a single hammer instance handle this event
      if (event.type !== 'hammer.input') {
        // it is possible that the same srcEvent is used with multiple hammer events,
        // we keep track on which events are handled in an object _handled
        if (!event.srcEvent._handled) {
          event.srcEvent._handled = {};
        }

        if (event.srcEvent._handled[event.type]) {
          return;
        }
        else {
          event.srcEvent._handled[event.type] = true;
        }
      }

      // attach a stopPropagation function to the event
      var stopped = false;
      event.stopPropagation = function () {
        stopped = true;
      };

      //wrap the srcEvent's stopPropagation to also stop hammer propagation:
      var srcStop = event.srcEvent.stopPropagation;
      if(typeof srcStop == "function") {
        event.srcEvent.stopPropagation = function(){
          srcStop();
          event.stopPropagation();
        }
      }

      // attach firstTarget property to the event
      event.firstTarget = _firstTarget;

      // propagate over all elements (until stopped)
      var elem = _firstTarget;
      while (elem && !stopped) {
        if(elem.hammer){
          var _handlers;
          for(var k = 0; k < elem.hammer.length; k++){
            _handlers = elem.hammer[k]._handlers[event.type];
            if(_handlers) for (var i = 0; i < _handlers.length && !stopped; i++) {
              _handlers[i](event);
            }
          }
        }
        elem = elem.parentNode;
      }
    }

    return wrapper;
  };
}));

},{}]},{},[1])(1)
});
