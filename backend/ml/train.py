import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

from .config import DATA_PATH, FEATURES, MODEL_PATH


def main():
    df = pd.read_csv(DATA_PATH)
    x_train, x_test, y_train, y_test = train_test_split(
        df[FEATURES], df["label"], test_size=0.2, random_state=42, stratify=df["label"]
    )
    model = RandomForestClassifier(
        n_estimators=150, max_depth=8, random_state=42, n_jobs=-1
    ).fit(x_train, y_train)

    print(classification_report(y_test, model.predict(x_test)))
    joblib.dump({"model": model, "medians": df[FEATURES].median().to_dict()}, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()