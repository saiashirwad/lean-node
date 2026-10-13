#include <stdint.h>
#include <node_api.h>
#include <lean/lean.h>

extern uint32_t lean_fulfill(uint32_t stock, uint32_t requested);
extern lean_obj_res initialize_Inventory(uint8_t builtin);

static bool read_quantity(napi_env env, napi_value value, uint32_t *quantity) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok || type != napi_number) {
    napi_throw_type_error(env, NULL, "Quantities must be numbers.");
    return false;
  }

  double number;
  if (napi_get_value_double(env, value, &number) != napi_ok) {
    napi_throw_error(env, NULL, "Could not read quantity.");
    return false;
  }

  if (!(number >= 0 && number <= UINT32_MAX) || (double)(uint32_t)number != number) {
    napi_throw_range_error(env, NULL, "Quantities must be integers from 0 to 4294967295.");
    return false;
  }

  *quantity = (uint32_t)number;
  return true;
}

static napi_value fulfill(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok) {
    napi_throw_error(env, NULL, "Could not read arguments.");
    return NULL;
  }
  if (argc != 2) {
    napi_throw_type_error(env, NULL, "fulfill expects stock and requested quantities.");
    return NULL;
  }

  uint32_t stock, requested;
  if (!read_quantity(env, argv[0], &stock) || !read_quantity(env, argv[1], &requested)) {
    return NULL;
  }

  napi_value result;
  if (napi_create_uint32(env, lean_fulfill(stock, requested), &result) != napi_ok) {
    napi_throw_error(env, NULL, "Could not create result.");
    return NULL;
  }
  return result;
}

NAPI_MODULE_INIT() {
  lean_object *initialized = initialize_Inventory(1);
  if (lean_io_result_is_error(initialized)) {
    lean_dec(initialized);
    napi_throw_error(env, NULL, "Could not initialize Lean.");
    return NULL;
  }
  lean_dec(initialized);
  lean_io_mark_end_initialization();

  napi_value function;
  if (napi_create_function(env, "fulfill", NAPI_AUTO_LENGTH, fulfill, NULL, &function) != napi_ok ||
      napi_set_named_property(env, exports, "fulfill", function) != napi_ok) {
    napi_throw_error(env, NULL, "Could not export fulfill.");
    return NULL;
  }
  return exports;
}
