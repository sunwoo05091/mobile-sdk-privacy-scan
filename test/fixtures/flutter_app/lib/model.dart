// Codegen-annotation fixture: uses @JsonSerializable WITHOUT importing
// json_annotation directly (the annotation arrives via another export, as
// freezed does). Import-grep alone would call json_annotation unused.
part 'model.g.dart';

@JsonSerializable()
class Model {
  Model();
}
