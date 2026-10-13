import Init

@[export lean_fulfill]
def fulfill (stock requested : UInt32) : UInt32 :=
  min stock requested

theorem fulfill_le_stock (stock requested : UInt32) :
    fulfill stock requested ≤ stock :=
  Std.min_le_left

theorem fulfill_le_requested (stock requested : UInt32) :
    fulfill stock requested ≤ requested :=
  Std.min_le_right

theorem fulfill_all_when_available (stock requested : UInt32)
    (h : requested ≤ stock) : fulfill stock requested = requested := by
  apply Std.le_antisymm
  · exact Std.min_le_right
  · exact Std.le_min_iff.mpr ⟨h, Std.le_refl _⟩
